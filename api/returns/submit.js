/* Customer submits a return/replacement request from account.html. Stored in
   shared Redis (not localStorage) since it needs to be visible to the admin
   from a completely different device than the customer who submitted it. */
const lib = require('../_lib');

const LIST_KEY = 'lg:returns';
const MAX_STORED = 500; // keep the list from growing unbounded forever
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 700000; // ~500KB after base64 overhead -- client compresses well below this

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const limit = lib.rateLimit(req, 'returns-submit', 8, 15 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });

  const body = await lib.readJsonBody(req);
  const orderId = String(body.orderId || '').trim();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const issue = String(body.issue || '').trim();
  const reason = String(body.reason || '').trim();
  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];

  if (!orderId) return res.status(400).json({ error: 'Missing order.' });
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!/^\+?[0-9]{10,13}$/.test(phone.replace(/\s/g, ''))) return res.status(400).json({ error: 'Please enter a valid mobile number.' });
  if (!issue) return res.status(400).json({ error: 'Please describe what is wrong with the product.' });
  if (!reason) return res.status(400).json({ error: 'Please tell us why you are returning it.' });
  if (!images.length) return res.status(400).json({ error: 'Please upload at least one clear photo of the product and the problem.' });
  for (const img of images) {
    if (typeof img !== 'string' || !img.startsWith('data:image/') || img.length > MAX_IMAGE_CHARS) {
      return res.status(400).json({ error: 'One of the photos could not be uploaded. Please try smaller/fewer photos.' });
    }
  }

  let orderSnapshot = null;
  if (body.orderSnapshot && typeof body.orderSnapshot === 'object') {
    try {
      const snapText = JSON.stringify(body.orderSnapshot);
      if (snapText.length <= 20000) orderSnapshot = body.orderSnapshot;
    } catch (e) { /* ignore malformed snapshot, request still proceeds without it */ }
  }

  const request = {
    id: 'RET-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    orderId: orderId,
    name: name,
    email: email,
    phone: phone,
    issue: issue,
    reason: reason,
    images: images,
    orderSnapshot: orderSnapshot,
    status: 'Pending',
    submittedAt: new Date().toISOString(),
    reviewedAt: null,
    adminNote: null
  };

  try {
    const list = await lib.kvGetJSON(LIST_KEY, []);
    list.unshift(request);
    if (list.length > MAX_STORED) list.length = MAX_STORED;
    await lib.kvSetJSON(LIST_KEY, list);
  } catch (err) {
    return res.status(503).json({ error: 'Could not submit your request right now. Please try again in a moment.' });
  }

  return res.status(200).json({ ok: true, id: request.id });
};
