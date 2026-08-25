/* Shared product catalog storage. Previously the catalog lived only in
   each browser's own localStorage -- meaning any product the admin added,
   edited, or deleted only ever showed up on the admin's own device, never
   for real customers on theirs. This endpoint moves the catalog into the
   same shared Redis store already used for returns/settings, so admin
   changes actually reach every customer.

   /get is public (every storefront page reads it). /update is admin-only
   and always overwrites the whole catalog with the array sent -- the
   client always reads the latest copy from here first before editing, so
   this doesn't clobber a change made from a different admin device. */
const lib = require('../_lib');

const PRODUCTS_KEY = 'lg:products';
const MAX_JSON_CHARS = 4000000; // generous -- product images are already compressed client-side

async function get(req, res) {
  try {
    const products = await lib.kvGetJSON(PRODUCTS_KEY, null);
    return res.status(200).json({ ok: true, products: products });
  } catch (err) {
    // Fail open: if storage is briefly unreachable, pages keep using
    // whatever catalog they already have locally rather than breaking.
    return res.status(200).json({ ok: true, products: null, degraded: true });
  }
}

async function update(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!lib.requireAdmin(req)) return res.status(401).json({ error: 'Not signed in.' });

  const limit = lib.rateLimit(req, 'products-update', 60, 10 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });

  const body = await lib.readJsonBody(req);
  const products = body.products;
  if (!Array.isArray(products)) return res.status(400).json({ error: 'Invalid product list.' });

  const text = JSON.stringify(products);
  if (text.length > MAX_JSON_CHARS) return res.status(400).json({ error: 'The product catalog is too large to save. Try smaller product images.' });

  try {
    await lib.kvSetJSON(PRODUCTS_KEY, products);
  } catch (err) {
    return res.status(503).json({ error: 'Could not save the product catalog right now. Please try again.' });
  }
  return res.status(200).json({ ok: true });
}

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action;
  if (action === 'get') return get(req, res);
  if (action === 'update') return update(req, res);
  return res.status(404).json({ error: 'Unknown endpoint.' });
};
