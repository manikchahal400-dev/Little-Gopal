/* Called by admin.html on page load to check whether the browser already
   holds a valid, unexpired admin session cookie. */
const lib = require('../_lib');

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const cookies = parseCookies(req.headers.cookie);
  const payload = lib.verifyToken(cookies.lg_admin_session, process.env.SESSION_SECRET);
  const valid = !!payload && Date.now() < payload.exp;
  return res.status(200).json({ loggedIn: valid });
};
