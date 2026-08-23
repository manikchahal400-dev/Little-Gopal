/* Step 2 of admin login: verify the WhatsApp code and the email code
   against the signed challenge from /api/auth/start. On success, issues a
   short-lived, HttpOnly session cookie the browser can't read via JS. */
const lib = require('../_lib');

const MAX_OTP_ATTEMPTS = 5;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await lib.readJsonBody(req);
  const pepper = process.env.OTP_SECRET;
  const payload = lib.verifyToken(body.challenge, pepper);

  if (!payload) return res.status(400).json({ error: 'This verification session is invalid. Please log in again.' });
  if (Date.now() > payload.exp) return res.status(400).json({ error: 'This verification code has expired. Please log in again.' });
  if ((payload.att || 0) >= MAX_OTP_ATTEMPTS) return res.status(400).json({ error: 'Too many incorrect attempts. Please log in again.' });

  const whatsappCode = String(body.whatsappCode || '').trim();
  const emailCode = String(body.emailCode || '').trim();
  const whatsappOk = lib.timingSafeEqualStr(lib.sha256(whatsappCode + pepper), payload.wh);
  const emailOk = lib.timingSafeEqualStr(lib.sha256(emailCode + pepper), payload.eh);

  if (!whatsappOk || !emailOk) {
    const retryToken = lib.signToken({ exp: payload.exp, wh: payload.wh, eh: payload.eh, att: (payload.att || 0) + 1 }, pepper);
    const remaining = MAX_OTP_ATTEMPTS - ((payload.att || 0) + 1);
    return res.status(401).json({
      error: (!whatsappOk && !emailOk) ? 'Both codes are incorrect.' : (!whatsappOk ? 'The WhatsApp code is incorrect.' : 'The email code is incorrect.'),
      challenge: retryToken,
      attemptsLeft: Math.max(remaining, 0)
    });
  }

  const sessionSecret = process.env.SESSION_SECRET;
  const session = lib.signToken({ sub: 'admin', exp: Date.now() + SESSION_TTL_MS }, sessionSecret);
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

  res.setHeader('Set-Cookie',
    `lg_admin_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}` + (isProd ? '; Secure' : ''));
  return res.status(200).json({ ok: true });
};
