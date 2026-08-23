/* Step 1 of admin login: verify username + password server-side.
   On success, returns a short-lived signed "challenge" proving the
   password step passed, which step 2 (verify.js) requires along with a
   6-digit code from an authenticator app. */
const lib = require('../_lib');

const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 5 * 60 * 1000;

// Simple in-memory lockout tracker. Serverless instances are short-lived and
// may be recycled, so this is a best-effort layer, not the only defence —
// the password hashing + TOTP code are what actually protect the account.
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

  const challenge = lib.signToken({ exp: now + CHALLENGE_TTL_MS, att: 0 }, process.env.OTP_SECRET);
  return res.status(200).json({ challenge });
};
