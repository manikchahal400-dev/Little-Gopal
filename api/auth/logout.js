const lib = require('../_lib');

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  res.setHeader('Set-Cookie', 'lg_admin_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
  return res.status(200).json({ ok: true });
};
