/* Shared helpers for the admin auth API routes.
   File is prefixed with "_" so Vercel does not treat it as its own route. */
const crypto = require('crypto');

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return Buffer.from(input, 'base64').toString('utf8');
}

function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Sign a JSON payload into "base64url(payload).hmacHex"
function signToken(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  return body + '.' + hmac(secret, body);
}

// Verify and decode a signed token. Returns the payload object, or null if invalid/tampered.
function verifyToken(token, secret) {
  if (!token || typeof token !== 'string' || token.indexOf('.') === -1) return null;
  const parts = token.split('.');
  const body = parts[0];
  const sig = parts.slice(1).join('.');
  const expected = hmac(secret, body);
  if (!timingSafeEqualStr(sig, expected)) return null;
  try { return JSON.parse(b64urlDecode(body)); } catch (e) { return null; }
}

function randomOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// --- TOTP (RFC 6238) — authenticator app codes, no third-party service needed ---
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input) {
  const clean = String(input).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secretBytes, counter, digits) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmacDigest = crypto.createHmac('sha1', secretBytes).update(buf).digest();
  const offset = hmacDigest[hmacDigest.length - 1] & 0xf;
  const binCode = ((hmacDigest[offset] & 0x7f) << 24) | ((hmacDigest[offset + 1] & 0xff) << 16) |
    ((hmacDigest[offset + 2] & 0xff) << 8) | (hmacDigest[offset + 3] & 0xff);
  return String(binCode % 10 ** digits).padStart(digits, '0');
}

// Verifies a 6-digit authenticator app code, tolerating +/- 1 time step (30s each)
// for clock drift between the server and the phone.
function verifyTotp(secretBase32, code, digits = 6, stepSeconds = 30, window = 1) {
  const cleanCode = String(code).trim();
  if (!/^\d{6}$/.test(cleanCode)) return false;
  const secretBytes = base32Decode(secretBase32);
  const counter = Math.floor(Date.now() / 1000 / stepSeconds);
  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const expected = hotp(secretBytes, counter + errorWindow, digits);
    if (timingSafeEqualStr(expected, cleanCode)) return true;
  }
  return false;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      if (typeof req.body === 'string') { try { return resolve(JSON.parse(req.body || '{}')); } catch (e) { return resolve({}); } }
      return resolve(req.body);
    }
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { resolve({}); } });
    req.on('error', reject);
  });
}

// Simple best-effort rate limiter shared by any endpoint that needs one.
// Serverless instances are short-lived and not shared across regions, so
// this slows down casual abuse rather than guaranteeing a hard cap — real
// protection ultimately comes from the cryptographic checks in each
// endpoint (password hash, payment signature), not this alone.
const rateLimitBuckets = global.__lgRateLimits || (global.__lgRateLimits = new Map());
function rateLimit(req, bucketName, maxRequests, windowMs) {
  const ip = req.headers['x-forwarded-for'] || 'local';
  const key = bucketName + ':' + ip;
  const now = Date.now();
  const record = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
  record.count += 1;
  rateLimitBuckets.set(key, record);
  return { limited: record.count > maxRequests, retryAfterMs: Math.max(record.resetAt - now, 0) };
}

async function sendResendEmail(toEmail, subject, text) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Little Gopal <onboarding@resend.dev>';
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: from, to: [toEmail], subject: subject, text: text })
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('Resend send failed: ' + resp.status + ' ' + errText);
  }
}

async function sendMsg91Sms(toNumber, otp) {
  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;
  const senderId = process.env.MSG91_SENDER_ID || 'LGOPAL';
  const mobile = toNumber.replace(/^\+/, ''); // MSG91 expects country code without '+', e.g. 919876543210
  const resp = await fetch('https://control.msg91.com/api/v5/otp?otp=' + encodeURIComponent(otp) +
    '&mobile=' + encodeURIComponent(mobile) +
    (templateId ? '&template_id=' + encodeURIComponent(templateId) : '') +
    (senderId ? '&sender=' + encodeURIComponent(senderId) : ''), {
    method: 'POST',
    headers: { 'authkey': authKey, 'Content-Type': 'application/json' }
  });
  const data = await resp.json().catch(function () { return {}; });
  if (!resp.ok || (data && data.type === 'error')) {
    throw new Error('MSG91 send failed: ' + (data && data.message ? data.message : resp.status));
  }
}

function setCors(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || '';
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = {
  b64url, b64urlDecode, hmac, sha256, timingSafeEqualStr,
  signToken, verifyToken, randomOtp, readJsonBody, setCors, rateLimit,
  sendResendEmail, sendMsg91Sms,
  base32Decode, verifyTotp
};
