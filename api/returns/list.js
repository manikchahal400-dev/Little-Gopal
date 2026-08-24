/* Admin-only: list all return/replacement requests, newest first. */
const lib = require('../_lib');

const LIST_KEY = 'lg:returns';

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!lib.requireAdmin(req)) return res.status(401).json({ error: 'Not signed in.' });

  try {
    const list = await lib.kvGetJSON(LIST_KEY, []);
    return res.status(200).json({ ok: true, requests: list });
  } catch (err) {
    return res.status(503).json({ error: 'Could not load return requests right now.' });
  }
};
