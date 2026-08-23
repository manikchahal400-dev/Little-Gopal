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

function setCors(req, res) {
  const origin = process.env.ALLOWED_ORIGIN || '';
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function sendWhatsApp(toNumber, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM; // e.g. "whatsapp:+14155238886"
  const to = 'whatsapp:' + toNumber; // toNumber must include country code, e.g. +919258358235
  const params = new URLSearchParams({ To: to, From: from, Body: body });
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(sid + ':' + token).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error('Twilio WhatsApp send failed: ' + resp.status + ' ' + text);
  }
}

async function sendEmail(toEmail, subject, text) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: from, name: 'Little Gopal Admin' },
      subject: subject,
      content: [{ type: 'text/plain', value: text }]
    })
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error('SendGrid send failed: ' + resp.status + ' ' + errText);
  }
}

module.exports = {
  b64url, b64urlDecode, hmac, sha256, timingSafeEqualStr,
  signToken, verifyToken, randomOtp, readJsonBody, setCors,
  sendWhatsApp, sendEmail
};
