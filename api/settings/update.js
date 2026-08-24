/* Admin-only: change store-wide settings (currently just codEnabled). */
const lib = require('../_lib');

const SETTINGS_KEY = 'lg:settings';
const DEFAULTS = { codEnabled: true };

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!lib.requireAdmin(req)) return res.status(401).json({ error: 'Not signed in.' });

  const body = await lib.readJsonBody(req);

  try {
    const current = await lib.kvGetJSON(SETTINGS_KEY, DEFAULTS);
    const updated = Object.assign({}, DEFAULTS, current);
    if (typeof body.codEnabled === 'boolean') updated.codEnabled = body.codEnabled;
    await lib.kvSetJSON(SETTINGS_KEY, updated);
    return res.status(200).json({ ok: true, settings: updated });
  } catch (err) {
    return res.status(503).json({ error: 'Could not save this setting right now. Please try again.' });
  }
};
