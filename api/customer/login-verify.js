/* Step 2 of customer login: check the code against the signed challenge
   from login-start.js. On success, issues a signed "verified identity"
   token the browser can hold onto (in localStorage) proving this email
   or mobile number was genuinely confirmed — separate from the profile
   details (name etc.) which still live client-side as before. */
const lib = require('../_lib');

const MAX_ATTEMPTS = 5;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
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
};
