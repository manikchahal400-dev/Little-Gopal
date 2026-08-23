/* Admin login: verify username + password server-side against stored
   hashes, then issue a short-lived HttpOnly session cookie. Single step —
   the earlier two-step (WhatsApp/email OTP, then authenticator app code)
   versions were removed after proving too unreliable to debug remotely;
   this keeps the real server-side password check + hashing + lockout,
   without a second step that depends on phone clock sync or a second
   network round trip. */
const lib = require('../_lib');

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Simple in-memory lockout tracker. Serverless instances are short-lived and
// may be recycled, so this is a best-effort layer, not the only defence —
// the password hashing is what actually protects the account.
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

  const session = lib.signToken({ sub: 'admin', exp: now + SESSION_TTL_MS }, process.env.SESSION_SECRET);
  const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
  res.setHeader('Set-Cookie',
    `lg_admin_session=${session}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_MS / 1000}` + (isProd ? '; Secure' : ''));

  return res.status(200).json({ ok: true });
};
