/* Lightweight, aggregate-only site analytics -- no per-visitor tracking,
   no cookies, no IDs tied to a person. Every event just increments a
   counter (or appends to a small capped list) inside one shared JSON
   object, so the admin can see things like "which products get viewed
   most" or "what are customers searching for" to improve the site.
   /beacon is public (fired from the storefront); /summary is admin-only. */
const lib = require('../_lib');

const STATS_KEY = 'lg:stats';
const MAX_SEARCHES = 100;
const MAX_PRODUCT_ENTRIES = 500; // safety cap so this never grows unbounded

function defaultStats() {
  return { pageViews: {}, deviceViews: { mobile: 0, desktop: 0 }, productViews: {}, searches: [], addToCart: 0, checkoutStarts: 0, ordersPlaced: 0, scansUsed: 0 };
}

function applyEvent(stats, event, body) {
  if (event === 'page_view') {
    const page = String(body.page || 'other').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'other';
    stats.pageViews[page] = (stats.pageViews[page] || 0) + 1;
    const device = body.device === 'mobile' ? 'mobile' : 'desktop';
    stats.deviceViews[device] = (stats.deviceViews[device] || 0) + 1;
  } else if (event === 'search') {
    const q = String(body.query || '').trim().toLowerCase().slice(0, 60);
    if (q) { stats.searches.unshift(q); if (stats.searches.length > MAX_SEARCHES) stats.searches.length = MAX_SEARCHES; }
  } else if (event === 'product_view') {
    const id = String(body.productId || '').trim().slice(0, 80);
    if (id) {
      stats.productViews[id] = (stats.productViews[id] || 0) + 1;
      const keys = Object.keys(stats.productViews);
      if (keys.length > MAX_PRODUCT_ENTRIES) {
        keys.sort(function (a, b) { return stats.productViews[a] - stats.productViews[b]; });
        keys.slice(0, keys.length - MAX_PRODUCT_ENTRIES).forEach(function (k) { delete stats.productViews[k]; });
      }
    }
  } else if (event === 'scan_used') {
    stats.scansUsed = (stats.scansUsed || 0) + 1;
  } else if (event === 'add_to_cart') {
    stats.addToCart = (stats.addToCart || 0) + 1;
  } else if (event === 'checkout_start') {
    stats.checkoutStarts = (stats.checkoutStarts || 0) + 1;
  } else if (event === 'order_placed') {
    stats.ordersPlaced = (stats.ordersPlaced || 0) + 1;
  }
}

async function beacon(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  // Generous limit and always returns 200 -- analytics must never surface
  // an error to a customer or block the page they're actually trying to use.
  const limit = lib.rateLimit(req, 'track-beacon', 300, 10 * 60 * 1000);
  if (limit.limited) return res.status(200).json({ ok: true });

  const body = await lib.readJsonBody(req);
  const event = String(body.event || '').trim();
  try {
    const stats = await lib.kvGetJSON(STATS_KEY, defaultStats());
    applyEvent(stats, event, body);
    await lib.kvSetJSON(STATS_KEY, stats);
  } catch (err) { /* best-effort only */ }
  return res.status(200).json({ ok: true });
}

async function summary(req, res) {
  if (!lib.requireAdmin(req)) return res.status(401).json({ error: 'Not signed in.' });
  try {
    const stats = await lib.kvGetJSON(STATS_KEY, defaultStats());
    return res.status(200).json({ ok: true, stats: stats });
  } catch (err) {
    return res.status(503).json({ error: 'Could not load site activity right now.' });
  }
}

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action;
  if (action === 'beacon') return beacon(req, res);
  if (action === 'summary') return summary(req, res);
  return res.status(404).json({ error: 'Unknown endpoint.' });
};
