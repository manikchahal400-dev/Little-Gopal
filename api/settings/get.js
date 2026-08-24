/* Public: read store-wide settings (currently just whether Cash on Delivery
   is offered at checkout). Read by checkout.html on every visit, from every
   customer's own device, so this has to live in shared storage -- the same
   reason api/returns/* needed it. */
const lib = require('../_lib');

const SETTINGS_KEY = 'lg:settings';
const DEFAULTS = { codEnabled: true };

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const settings = await lib.kvGetJSON(SETTINGS_KEY, DEFAULTS);
    return res.status(200).json({ ok: true, settings: Object.assign({}, DEFAULTS, settings) });
  } catch (err) {
    // Fail open: if storage is briefly unreachable, checkout should still
    // work normally (COD enabled) rather than break for every customer.
    return res.status(200).json({ ok: true, settings: DEFAULTS, degraded: true });
  }
};
