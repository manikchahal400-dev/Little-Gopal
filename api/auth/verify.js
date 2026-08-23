/* Step 2 of admin login: verify the 6-digit authenticator app code against
   the signed challenge from /api/auth/start. On success, issues a
   short-lived, HttpOnly session cookie the browser can't read via JS. */
const lib = require('../_lib');

const MAX_TOTP_ATTEMPTS = 5;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await lib.readJsonBody(req);
  const payload = lib.verifyToken(body.challenge, process.env.OTP_SECRET);

  if (!payload) return res.status(400).json({ error: 'This verification session is invalid. Please log in again.' });
  if (Date.now() > payload.exp) return res.status(400).json({ error: 'This verification session expired. Please log in again.' });
  if ((payload.att || 0) >= MAX_TOTP_ATTEMPTS) return res.status(400).json({ error: 'Too many incorrect attempts. Please log in again.' });

  const totpCode = String(body.totpCode || '').trim();
  const ok = lib.verifyTotp(process.env.ADMIN_TOTP_SECRET, totpCode);

  if (!ok) {
    const attempts = (payload.att || 0) + 1;
    const retryToken = lib.signToken({ exp: payload.exp, att: attempts }, process.env.OTP_SECRET);
    return res.status(401).json({
      error: 'Incorrect code.',
      challenge: retryToken,
      attemptsLeft: Math.max(MAX_TOTP_ATTEMPTS - attempts, 0)
    });
  }

  const session = lib.signToken({ sub: 'admin', exp: Date.now() + SESSION_TTL_MS }, process.env.SESSION_SECRET);
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

  res.setHeader('Set-Cookie',
    `lg_admin_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}` + (isProd ? '; Secure' : ''));
  return res.status(200).json({ ok: true });
};
