/* Admin-only: approve or reject a return/replacement request. */
const lib = require('../_lib');

const LIST_KEY = 'lg:returns';
const ALLOWED_STATUSES = ['Approved', 'Rejected', 'Pending'];

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!lib.requireAdmin(req)) return res.status(401).json({ error: 'Not signed in.' });

  const body = await lib.readJsonBody(req);
  const id = String(body.id || '').trim();
  const status = String(body.status || '').trim();
  const adminNote = body.adminNote ? String(body.adminNote).trim().slice(0, 500) : null;

  if (!id) return res.status(400).json({ error: 'Missing request id.' });
  if (ALLOWED_STATUSES.indexOf(status) === -1) return res.status(400).json({ error: 'Invalid status.' });

  try {
    const list = await lib.kvGetJSON(LIST_KEY, []);
    const request = list.find(function (r) { return r.id === id; });
    if (!request) return res.status(404).json({ error: 'Return request not found.' });
    request.status = status;
    request.reviewedAt = new Date().toISOString();
    if (adminNote !== null) request.adminNote = adminNote;
    await lib.kvSetJSON(LIST_KEY, list);
    return res.status(200).json({ ok: true, request: request });
  } catch (err) {
    return res.status(503).json({ error: 'Could not save this change right now. Please try again.' });
  }
};
