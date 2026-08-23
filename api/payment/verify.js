/* Independently confirms a Razorpay payment really happened, using
   cryptographic proof (HMAC-SHA256 over order_id + payment_id, signed
   with the secret Key Secret). This signature can only be produced by
   someone who holds the secret key — Razorpay itself — so a client
   cannot forge a "successful payment" without one actually occurring. */
const crypto = require('crypto');
const lib = require('../_lib');

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return res.status(503).json({ error: 'Online payments are not configured yet.' });

  const body = await lib.readJsonBody(req);
  const orderId = String(body.razorpay_order_id || '');
  const paymentId = String(body.razorpay_payment_id || '');
  const signature = String(body.razorpay_signature || '');
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ error: 'Missing payment details.', verified: false });
  }

  const expected = crypto.createHmac('sha256', keySecret).update(orderId + '|' + paymentId).digest('hex');
  const verified = lib.timingSafeEqualStr(expected, signature);

  if (!verified) {
    return res.status(400).json({ error: 'Payment could not be verified. No order has been confirmed.', verified: false });
  }
  return res.status(200).json({ verified: true, paymentId: paymentId, orderId: orderId });
};
