/* Customer rewards: loyalty points (earned on orders, redeemable as a
   checkout discount) and a refer-a-friend program. Loyalty/referral data
   is keyed by the customer's verified email (from OTP login), stored in
   the same shared Redis used by returns/settings/products, so it follows
   the customer across devices rather than living in one browser's
   localStorage.

   Trust note: like api/returns (which trusts a client-submitted order
   snapshot), this trusts the order total the browser reports when
   awarding points -- there's no real server-side order ledger yet. Each
   earn call is capped and rate-limited so any abuse stays small and
   bounded, consistent with the rest of the site's honesty about this
   limitation rather than pretending it's bank-grade. */
const lib = require('../_lib');

const LOYALTY_KEY = 'lg:loyalty';
const REFERRAL_KEY = 'lg:referrals';
const EARN_DIVISOR = 20; // 1 point per ₹20 spent
const REDEEM_RATE = 1; // 1 point = ₹1 discount
const MIN_REDEEM = 50;
const MAX_ORDER_FOR_POINTS = 50000; // sanity cap per single earn call
const REFERRAL_BONUS_POINTS = 100; // credited to the referrer
const REFERRAL_DISCOUNT_RUPEES = 100; // given to the new customer

function normEmail(v) { return String(v || '').trim().toLowerCase(); }

// Loyalty/referrals are tracked by email specifically -- a mobile-only
// login doesn't have one to key this shared record by.
async function verifyIdentity(body) {
  const pepper = process.env.OTP_SECRET;
  if (!pepper) return null;
  const payload = lib.verifyToken(body.identityToken, pepper);
  if (!payload || payload.sub !== 'customer' || payload.method !== 'email' || Date.now() > payload.exp) return null;
  return normEmail(payload.value);
}

async function loadLoyalty() { return lib.kvGetJSON(LOYALTY_KEY, {}); }
async function saveLoyalty(all) { return lib.kvSetJSON(LOYALTY_KEY, all); }
function ensureRecord(all, email) {
  if (!all[email]) all[email] = { points: 0, creditedOrderIds: [] };
  return all[email];
}

async function balance(req, res) {
  const body = await lib.readJsonBody(req);
  const email = await verifyIdentity(body);
  if (!email) return res.status(401).json({ error: 'Please log in again.' });
  try {
    const all = await loadLoyalty();
    return res.status(200).json({ ok: true, points: (all[email] && all[email].points) || 0 });
  } catch (err) {
    return res.status(503).json({ error: 'Could not load your rewards right now.' });
  }
}

async function earn(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const limit = lib.rateLimit(req, 'rewards-earn', 20, 15 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many requests. Please try again later.' });

  const body = await lib.readJsonBody(req);
  const email = await verifyIdentity(body);
  if (!email) return res.status(401).json({ error: 'Please log in again.' });

  const orderId = String(body.orderId || '').trim();
  const orderTotal = Math.min(Math.max(Number(body.orderTotal) || 0, 0), MAX_ORDER_FOR_POINTS);
  if (!orderId) return res.status(400).json({ error: 'Missing order id.' });

  try {
    const all = await loadLoyalty();
    const record = ensureRecord(all, email);
    if (record.creditedOrderIds.indexOf(orderId) === -1) {
      record.points = (record.points || 0) + Math.floor(orderTotal / EARN_DIVISOR);
      record.creditedOrderIds.push(orderId);
      if (record.creditedOrderIds.length > 200) record.creditedOrderIds = record.creditedOrderIds.slice(-200);
      await saveLoyalty(all);
    }
    return res.status(200).json({ ok: true, points: record.points });
  } catch (err) {
    return res.status(503).json({ error: 'Could not update your rewards right now.' });
  }
}

async function redeem(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const limit = lib.rateLimit(req, 'rewards-redeem', 20, 15 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many requests. Please try again later.' });

  const body = await lib.readJsonBody(req);
  const email = await verifyIdentity(body);
  if (!email) return res.status(401).json({ error: 'Please log in again.' });

  const points = Math.floor(Number(body.points) || 0);
  if (points < MIN_REDEEM) return res.status(400).json({ error: 'You need at least ' + MIN_REDEEM + ' points to redeem.' });

  try {
    const all = await loadLoyalty();
    const record = ensureRecord(all, email);
    if ((record.points || 0) < points) return res.status(400).json({ error: 'You do not have enough points.' });
    record.points -= points;
    await saveLoyalty(all);
    return res.status(200).json({ ok: true, points: record.points, discountRupees: points * REDEEM_RATE });
  } catch (err) {
    return res.status(503).json({ error: 'Could not redeem points right now. Please try again.' });
  }
}

async function loadReferrals() { return lib.kvGetJSON(REFERRAL_KEY, { codes: {}, redemptions: {} }); }
async function saveReferrals(all) { return lib.kvSetJSON(REFERRAL_KEY, all); }
function makeReferralCode() { return 'REF-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }

async function referralInfo(req, res) {
  const body = await lib.readJsonBody(req);
  const email = await verifyIdentity(body);
  if (!email) return res.status(401).json({ error: 'Please log in again.' });
  try {
    const all = await loadReferrals();
    if (!all.codes[email]) {
      let code;
      const existing = Object.values(all.codes);
      do { code = makeReferralCode(); } while (existing.indexOf(code) !== -1);
      all.codes[email] = code;
      await saveReferrals(all);
    }
    return res.status(200).json({ ok: true, code: all.codes[email] });
  } catch (err) {
    return res.status(503).json({ error: 'Could not load your referral code right now.' });
  }
}

// Public (no login required) -- a brand-new customer entering a code at
// checkout may not have an account yet. Abuse is bounded by: the code must
// already exist, self-referral is blocked, and each email can redeem a
// referral at most once, ever.
async function referralApply(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const limit = lib.rateLimit(req, 'rewards-referral-apply', 15, 15 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many requests. Please try again later.' });

  const body = await lib.readJsonBody(req);
  const code = String(body.code || '').trim().toUpperCase();
  const newCustomerEmail = normEmail(body.newCustomerEmail);
  if (!code) return res.status(400).json({ error: 'Please enter a referral code.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newCustomerEmail)) return res.status(400).json({ error: 'Please enter your email above first, then apply the referral code.' });

  try {
    const referrals = await loadReferrals();
    const referrerEmail = Object.keys(referrals.codes).find(function (e) { return referrals.codes[e] === code; });
    if (!referrerEmail) return res.status(404).json({ error: 'That referral code was not found.' });
    if (referrerEmail === newCustomerEmail) return res.status(400).json({ error: 'You cannot use your own referral code.' });
    if (referrals.redemptions[newCustomerEmail]) return res.status(400).json({ error: 'A referral code has already been used on this account.' });

    referrals.redemptions[newCustomerEmail] = referrerEmail;
    await saveReferrals(referrals);

    const loyalty = await loadLoyalty();
    const referrerRecord = ensureRecord(loyalty, referrerEmail);
    referrerRecord.points = (referrerRecord.points || 0) + REFERRAL_BONUS_POINTS;
    await saveLoyalty(loyalty);

    return res.status(200).json({ ok: true, discountRupees: REFERRAL_DISCOUNT_RUPEES });
  } catch (err) {
    return res.status(503).json({ error: 'Could not apply that referral code right now. Please try again.' });
  }
}

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const action = req.query.action;
  if (action === 'balance') return balance(req, res);
  if (action === 'earn') return earn(req, res);
  if (action === 'redeem') return redeem(req, res);
  if (action === 'referral-info') return referralInfo(req, res);
  if (action === 'referral-apply') return referralApply(req, res);
  return res.status(404).json({ error: 'Unknown endpoint.' });
};
