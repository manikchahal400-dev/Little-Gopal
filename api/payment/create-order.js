/* Creates a real Razorpay order server-side using the secret Key Secret,
   which never reaches the browser. The client then opens Razorpay's
   checkout against this specific order_id — binding the payment to an
   amount the server itself set, not one the browser merely claims. */
const lib = require('../_lib');

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
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
};
