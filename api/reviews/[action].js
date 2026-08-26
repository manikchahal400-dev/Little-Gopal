/* Product reviews & ratings. Previously localStorage-only, meaning no
   customer ever actually saw another customer's review -- moved into the
   same shared Redis storage already used for returns/settings/rewards,
   for the same reason: this has to be visible to every customer's own
   device, not just the browser that wrote it.

   Reviews are an honor system (no purchase verification -- there's no
   real order ledger to check a review against, same limitation already
   disclosed elsewhere in this codebase), but they are at last genuinely
   shared, with optional customer-uploaded photos. */
const lib = require('../_lib');

const REVIEWS_KEY = 'lg:reviews';
const MAX_PER_PRODUCT = 200;
const MAX_IMAGES = 3;
const MAX_IMAGE_CHARS = 500000; // client compresses well below this
const MAX_COMMENT_CHARS = 800;

async function loadAll() { return lib.kvGetJSON(REVIEWS_KEY, {}); }
async function saveAll(all) { return lib.kvSetJSON(REVIEWS_KEY, all); }

async function get(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = await lib.readJsonBody(req);
  const productId = String(body.productId || '').trim();
  if (!productId) return res.status(400).json({ error: 'Missing product id.' });
  try {
    const all = await loadAll();
    return res.status(200).json({ ok: true, reviews: all[productId] || [] });
  } catch (err) {
    return res.status(503).json({ error: 'Could not load reviews right now.' });
  }
}

// One lightweight call for every listing page (home, collection, beauty) to
// get real aggregate ratings for every product at once, without each page
// having to fetch full review text/photos for products it's just showing a
// star rating for.
async function summary(req, res) {
  try {
    const all = await loadAll();
    const out = {};
    Object.keys(all).forEach(function (id) {
      const list = all[id] || [];
      if (!list.length) return;
      const sum = list.reduce(function (s, r) { return s + (r.rating || 0); }, 0);
      out[id] = { count: list.length, average: Math.round((sum / list.length) * 10) / 10 };
    });
    return res.status(200).json({ ok: true, summary: out });
  } catch (err) {
    return res.status(503).json({ error: 'Could not load ratings right now.' });
  }
}

async function add(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const limit = lib.rateLimit(req, 'reviews-add', 8, 15 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });

  const body = await lib.readJsonBody(req);
  const productId = String(body.productId || '').trim();
  const name = String(body.name || '').trim().slice(0, 60) || 'A devotee';
  const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating)) || 5));
  const comment = String(body.comment || '').trim().slice(0, MAX_COMMENT_CHARS);
  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];

  if (!productId) return res.status(400).json({ error: 'Missing product id.' });
  if (!comment) return res.status(400).json({ error: 'Please write a short review.' });
  for (const img of images) {
    if (typeof img !== 'string' || !img.startsWith('data:image/') || img.length > MAX_IMAGE_CHARS) {
      return res.status(400).json({ error: 'One of the photos could not be uploaded. Please try a smaller photo.' });
    }
  }

  const review = { name: name, rating: rating, comment: comment, images: images, date: new Date().toISOString() };

  try {
    const all = await loadAll();
    all[productId] = all[productId] || [];
    all[productId].unshift(review);
    if (all[productId].length > MAX_PER_PRODUCT) all[productId].length = MAX_PER_PRODUCT;
    await saveAll(all);
  } catch (err) {
    return res.status(503).json({ error: 'Could not save your review right now. Please try again.' });
  }
  return res.status(200).json({ ok: true, review: review });
}

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const action = req.query.action;
  if (action === 'get') return get(req, res);
  if (action === 'summary') return summary(req, res);
  if (action === 'add') return add(req, res);
  return res.status(404).json({ error: 'Unknown endpoint.' });
};
