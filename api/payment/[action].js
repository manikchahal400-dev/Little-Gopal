/* Consolidated Razorpay routes: /api/payment/create-order,
   /api/payment/verify -- combined into one Vercel serverless function
   (routed by the [action] filename segment) so the project stays under
   the Hobby plan's 12-function-per-deployment limit. Behaviour of each
   action is unchanged from the original separate files. */
const crypto = require('crypto');
const lib = require('../_lib');

async function createOrder(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const limit = lib.rateLimit(req, 'create-order', 20, 10 * 60 * 1000);
  if (limit.limited) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
  }

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return res.status(503).json({ error: 'Online payments are not configured yet. Please choose Cash on Delivery, or contact us.' });
  }

  const body = await lib.readJsonBody(req);
  const amountRupees = Number(body.amount);
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
    return res.status(400).json({ error: 'Invalid order amount.' });
  }

  const amountPaise = Math.round(amountRupees * 100);
  const receipt = 'lg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  try {
    const resp = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(keyId + ':' + keySecret).toString('base64'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt: receipt })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(502).json({ error: (data && data.error && data.error.description) || 'Could not create the payment order.' });
    }
    return res.status(200).json({ orderId: data.id, amount: data.amount, currency: data.currency, keyId: keyId });
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach the payment gateway. Please try again.' });
  }
}

async function verify(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const limit = lib.rateLimit(req, 'verify', 20, 10 * 60 * 1000);
  if (limit.limited) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.', verified: false });
  }

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
}

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action;
  if (action === 'create-order') return createOrder(req, res);
  if (action === 'verify') return verify(req, res);
  return res.status(404).json({ error: 'Unknown endpoint.' });
};
