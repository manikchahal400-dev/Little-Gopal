/* Consolidated admin-auth routes: /api/auth/start, /api/auth/session,
   /api/auth/logout -- combined into one Vercel serverless function
   (routed by the [action] filename segment) so the project stays under
   the Hobby plan's 12-function-per-deployment limit. Behaviour of each
   action is unchanged from the original separate files. */
const lib = require('../_lib');

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const ADMIN_AUTH_KEY = 'lg:admin-auth';

// Simple in-memory lockout tracker. Serverless instances are short-lived and
// may be recycled, so this is a best-effort layer, not the only defence —
// the password hashing is what actually protects the account.
const attemptsByKey = global.__lgAttempts || (global.__lgAttempts = new Map());

// Admin username/password hashes normally live in the ADMIN_USER_HASH /
// ADMIN_PASS_HASH env vars (set once via the Vercel dashboard/API). Once the
// admin changes their password from the dashboard, the new hashes are saved
// in the same shared Redis store used for returns/settings instead -- env
// vars can only be edited outside the running app, so self-service changes
// need somewhere the app itself can write to. If nothing has been changed
// yet, this falls back to the original env vars.
async function getAdminHashes() {
  try {
    const stored = await lib.kvGetJSON(ADMIN_AUTH_KEY, null);
    if (stored && stored.userHash && stored.passHash) return stored;
  } catch (err) { /* storage unreachable -- fall back to env vars below */ }
  return { userHash: process.env.ADMIN_USER_HASH || '', passHash: process.env.ADMIN_PASS_HASH || '' };
}

async function start(req, res) {
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

  const current = await getAdminHashes();
  const userHash = lib.sha256(username);
  const passHash = lib.sha256(password);
  const userOk = lib.timingSafeEqualStr(userHash, current.userHash);
  const passOk = lib.timingSafeEqualStr(passHash, current.passHash);

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
}

async function session(req, res) {
  const cookies = lib.parseCookies(req.headers.cookie);
  const payload = lib.verifyToken(cookies.lg_admin_session, process.env.SESSION_SECRET);
  const valid = !!payload && Date.now() < payload.exp;
  return res.status(200).json({ loggedIn: valid });
}

async function logout(req, res) {
  res.setHeader('Set-Cookie', 'lg_admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  return res.status(200).json({ ok: true });
}

// Self-service password change: must already be signed in, and must
// correctly re-enter the CURRENT username + password (not just be logged
// in) before a new one is accepted -- a stolen/left-open session alone
// isn't enough to lock the real owner out.
async function changePassword(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!lib.requireAdmin(req)) return res.status(401).json({ error: 'Not signed in.' });

  const limit = lib.rateLimit(req, 'change-password', 6, 15 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many attempts. Please wait a few minutes and try again.' });

  const body = await lib.readJsonBody(req);
  const currentUsername = String(body.currentUsername || '').trim();
  const currentPassword = String(body.currentPassword || '');
  const newUsername = String(body.newUsername || '').trim();
  const newPassword = String(body.newPassword || '');

  if (!newUsername) return res.status(400).json({ error: 'Please enter a username.' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  const current = await getAdminHashes();
  const userOk = lib.timingSafeEqualStr(lib.sha256(currentUsername), current.userHash);
  const passOk = lib.timingSafeEqualStr(lib.sha256(currentPassword), current.passHash);
  if (!userOk || !passOk) return res.status(401).json({ error: 'Your current username or password is incorrect.' });

  try {
    await lib.kvSetJSON(ADMIN_AUTH_KEY, { userHash: lib.sha256(newUsername), passHash: lib.sha256(newPassword) });
  } catch (err) {
    return res.status(503).json({ error: 'Could not save the new password right now. Please try again.' });
  }
  return res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action;
  if (action === 'start') return start(req, res);
  if (action === 'session') return session(req, res);
  if (action === 'logout') return logout(req, res);
  if (action === 'change-password') return changePassword(req, res);
  return res.status(404).json({ error: 'Unknown endpoint.' });
};
