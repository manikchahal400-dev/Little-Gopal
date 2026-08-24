/* Public but scoped: lets a customer check the current status of a return
   request they already submitted, by its id + the email they submitted it
   with. Does not expose the admin's private note or any other customer's
   data -- account.html polls this to show live Approved/Rejected status
   instead of the frozen "Pending" it got back at submit time. */
const lib = require('../_lib');

const LIST_KEY = 'lg:returns';

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const limit = lib.rateLimit(req, 'returns-status', 40, 10 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' });

  const body = await lib.readJsonBody(req);
  const id = String(body.id || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  if (!id) return res.status(400).json({ error: 'Missing request id.' });

  try {
    const list = await lib.kvGetJSON(LIST_KEY, []);
    const request = list.find(function (r) { return r.id === id; });
    if (!request || (email && String(request.email || '').toLowerCase() !== email)) {
      return res.status(404).json({ error: 'Return request not found.' });
    }
    return res.status(200).json({ ok: true, status: request.status, submittedAt: request.submittedAt, reviewedAt: request.reviewedAt });
  } catch (err) {
    return res.status(503).json({ error: 'Could not check the status right now.' });
  }
};
