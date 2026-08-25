/* Consolidated customer-login routes: /api/customer/login-start,
   /api/customer/login-verify -- combined into one Vercel serverless
   function (routed by the [action] filename segment) so the project
   stays under the Hobby plan's 12-function-per-deployment limit.
   Behaviour of each action is unchanged from the original separate files. */
const lib = require('../_lib');

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function loginStart(req, res) {
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
}

async function loginVerify(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const limit = lib.rateLimit(req, 'customer-login-verify', 20, 10 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.', verified: false });

  const body = await lib.readJsonBody(req);
  const pepper = process.env.OTP_SECRET;
  const payload = lib.verifyToken(body.challenge, pepper);

  if (!payload) return res.status(400).json({ error: 'This login session is invalid. Please start again.', verified: false });
  if (Date.now() > payload.exp) return res.status(400).json({ error: 'This code has expired. Please start again.', verified: false });
  if ((payload.att || 0) >= MAX_ATTEMPTS) return res.status(400).json({ error: 'Too many incorrect attempts. Please start again.', verified: false });

  const code = String(body.code || '').trim();
  const ok = lib.timingSafeEqualStr(lib.sha256(code + pepper), payload.h);

  if (!ok) {
    const attempts = (payload.att || 0) + 1;
    const retryToken = lib.signToken({ exp: payload.exp, method: payload.method, value: payload.value, h: payload.h, att: attempts }, pepper);
    return res.status(401).json({
      error: 'Incorrect code.',
      challenge: retryToken,
      attemptsLeft: Math.max(MAX_ATTEMPTS - attempts, 0),
      verified: false
    });
  }

  const identityToken = lib.signToken({
    sub: 'customer',
    method: payload.method,
    value: payload.value,
    exp: Date.now() + SESSION_TTL_MS
  }, pepper);

  return res.status(200).json({ verified: true, method: payload.method, value: payload.value, identityToken: identityToken });
}

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action;
  if (action === 'login-start') return loginStart(req, res);
  if (action === 'login-verify') return loginVerify(req, res);
  return res.status(404).json({ error: 'Unknown endpoint.' });
};
