/* Step 1 of customer login: send a 6-digit code to the customer's email
   (via Resend) or mobile number (via MSG91), depending on what they
   entered. No customer data is stored server-side — the OTP hash lives
   only inside a short-lived signed token the browser holds until step 2. */
const lib = require('../_lib');

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const limit = lib.rateLimit(req, 'customer-login-start', 10, 10 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });

  const body = await lib.readJsonBody(req);
  const method = body.method === 'mobile' ? 'mobile' : 'email';
  const value = String(body.value || '').trim();

  if (method === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (!process.env.RESEND_API_KEY) return res.status(503).json({ error: 'Email login is not configured yet.' });
  } else {
    if (!/^\+?[0-9]{10,13}$/.test(value.replace(/\s/g, ''))) return res.status(400).json({ error: 'Please enter a valid mobile number.' });
    if (!process.env.MSG91_AUTH_KEY) return res.status(503).json({ error: 'Mobile login is not configured yet.' });
  }

  const otp = lib.randomOtp();
  const pepper = process.env.OTP_SECRET;
  if (!pepper) return res.status(503).json({ error: 'Login is not configured yet.' });

  try {
    if (method === 'email') {
      await lib.sendResendEmail(value, 'Your Little Gopal login code', 'Your login code is ' + otp + '. It expires in 5 minutes. Never share this code with anyone.');
    } else {
      // Normalize to MSG91's expected format: country code + number, no '+', no leading 0.
      let digits = value.replace(/\D/g, '').replace(/^0+/, '');
      if (digits.length === 10) digits = '91' + digits; // bare 10-digit Indian number
      await lib.sendMsg91Sms(digits, otp);
    }
  } catch (err) {
    return res.status(502).json({ error: 'Could not send the verification code. Please try again.' });
  }

  const challenge = lib.signToken({
    exp: Date.now() + CHALLENGE_TTL_MS,
    method: method,
    value: value,
    h: lib.sha256(otp + pepper),
    att: 0
  }, pepper);

  return res.status(200).json({ challenge: challenge });
};
