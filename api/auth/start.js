/* Step 1 of admin login: verify username + password, then send a WhatsApp
   OTP and an email OTP. Returns only an opaque signed "challenge" token —
   the actual OTP codes are never sent back to the browser, only delivered
   via WhatsApp and email. */
const lib = require('../_lib');

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 5 * 60 * 1000;

// Simple in-memory lockout tracker. Serverless instances are short-lived and
// may be recycled, so this is a best-effort layer, not the only defence —
// the OTP + password hashing is what actually protects the account.
const attemptsByKey = global.__lgAttempts || (global.__lgAttempts = new Map());

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = (req.headers['x-forwarded-for'] || 'local');
  const now = Date.now();
  const record = attemptsByKey.get(key) || { count: 0, lockUntil: 0 };
  if (record.lockUntil > now) {
    return res.status(429).json({ error: 'Too many attempts. Try again in ' + Math.ceil((record.lockUntil - now) / 60000) + ' minute(s).' });
  }

  const body = await lib.readJsonBody(req);
  const username = String(body.username || '').trim();
  const password = String(body.password || '');

  const userHash = lib.sha256(username);
  const passHash = lib.sha256(password);
  const userOk = lib.timingSafeEqualStr(userHash, process.env.ADMIN_USER_HASH || '');
  const passOk = lib.timingSafeEqualStr(passHash, process.env.ADMIN_PASS_HASH || '');

  if (!userOk || !passOk) {
    record.count += 1;
    if (record.count >= MAX_LOGIN_ATTEMPTS) { record.lockUntil = now + LOGIN_LOCK_MS; record.count = 0; }
    attemptsByKey.set(key, record);
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  attemptsByKey.set(key, { count: 0, lockUntil: 0 });

  const whatsappOtp = lib.randomOtp();
  const emailOtp = lib.randomOtp();
  const pepper = process.env.OTP_SECRET;

  try {
    await Promise.all([
      lib.sendWhatsApp(process.env.ADMIN_WHATSAPP_TO, `Little Gopal admin login — your WhatsApp verification code is ${whatsappOtp}. It expires in 5 minutes. Never share this code.`),
      lib.sendEmail(process.env.ADMIN_EMAIL_TO, 'Little Gopal admin login — email verification code', `Your email verification code is ${emailOtp}. It expires in 5 minutes. Never share this code.`)
    ]);
  } catch (err) {
    return res.status(502).json({ error: 'Could not send verification codes. ' + err.message });
  }

  const challenge = lib.signToken({
    exp: now + CHALLENGE_TTL_MS,
    wh: lib.sha256(whatsappOtp + pepper),
    eh: lib.sha256(emailOtp + pepper),
    att: 0
  }, pepper);

  return res.status(200).json({ challenge });
};
