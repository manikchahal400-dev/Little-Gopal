/* Consolidated store-settings routes: /api/settings/get,
   /api/settings/update -- combined into one Vercel serverless function
   (routed by the [action] filename segment) so the project stays under
   the Hobby plan's 12-function-per-deployment limit. Behaviour of each
   action is unchanged from the original separate files. */
const lib = require('../_lib');

const SETTINGS_KEY = 'lg:settings';
const DEFAULTS = { codEnabled: true, trendingSlideIds: [], trendingSlideInterval: 5 };
const MAX_TRENDING_ITEMS = 20;
const MIN_INTERVAL = 2, MAX_INTERVAL = 30;

async function get(req, res) {
  try {
    const settings = await lib.kvGetJSON(SETTINGS_KEY, DEFAULTS);
    return res.status(200).json({ ok: true, settings: Object.assign({}, DEFAULTS, settings) });
  } catch (err) {
    // Fail open: if storage is briefly unreachable, checkout should still
    // work normally (COD enabled) rather than break for every customer.
    return res.status(200).json({ ok: true, settings: DEFAULTS, degraded: true });
  }
}

async function update(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!lib.requireAdmin(req)) return res.status(401).json({ error: 'Not signed in.' });

  const body = await lib.readJsonBody(req);

  try {
    const current = await lib.kvGetJSON(SETTINGS_KEY, DEFAULTS);
    const updated = Object.assign({}, DEFAULTS, current);
    if (typeof body.codEnabled === 'boolean') updated.codEnabled = body.codEnabled;
    if (Array.isArray(body.trendingSlideIds)) {
      updated.trendingSlideIds = body.trendingSlideIds.filter(function (id) { return typeof id === 'string'; }).slice(0, MAX_TRENDING_ITEMS);
    }
    if (body.trendingSlideInterval !== undefined) {
      const seconds = Number(body.trendingSlideInterval);
      if (!Number.isFinite(seconds)) return res.status(400).json({ error: 'Invalid slide timing.' });
      updated.trendingSlideInterval = Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(seconds)));
    }
    await lib.kvSetJSON(SETTINGS_KEY, updated);
    return res.status(200).json({ ok: true, settings: updated });
  } catch (err) {
    return res.status(503).json({ error: 'Could not save this setting right now. Please try again.' });
  }
}

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action;
  if (action === 'get') return get(req, res);
  if (action === 'update') return update(req, res);
  return res.status(404).json({ error: 'Unknown endpoint.' });
};
