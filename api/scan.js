/* Photo-based product search ("scan a product", like Amazon's camera
   search). The customer's photo never gets matched against products by
   this endpoint directly -- it's sent to Claude's vision API to get back
   a short list of plain-English search keywords (item type, colour,
   style), which the browser then runs through the site's existing
   Store.searchProducts() against the catalog it already has synced
   locally. Keeps this endpoint simple, cheap, and free of any risk of a
   model hallucinating a product id that doesn't exist. */
const lib = require('./_lib');

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_BASE64_CHARS = 2000000; // ~1.5MB decoded -- client already compresses well below this

module.exports = async function handler(req, res) {
  lib.setCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const limit = lib.rateLimit(req, 'scan', 15, 15 * 60 * 1000);
  if (limit.limited) return res.status(429).json({ error: 'Too many photo searches. Please wait a few minutes and try again.' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Photo search is not set up yet. Please use text search for now.' });

  const body = await lib.readJsonBody(req);
  const image = String(body.image || '');
  const match = image.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/);
  if (!match) return res.status(400).json({ error: 'Please take or upload a valid photo.' });
  const mediaType = match[1], base64Data = match[2];
  if (base64Data.length > MAX_BASE64_CHARS) return res.status(400).json({ error: 'That photo is too large. Please try again.' });

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            {
              type: 'text',
              text: 'A customer of an online shop selling devotional items for Krishna/Laddu Gopal idols ' +
                '(poshaks/clothes, mukuts/crowns, jhulas/swings, singhasans/thrones, jewellery, beauty and bathing items) ' +
                'took this photo of a product they are looking for. Reply with ONLY a comma-separated list of 3 to 6 ' +
                'short search keywords describing what is shown (item type, colour, material, style). ' +
                'No other text, no explanation, no numbering.'
            }
          ]
        }]
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      return res.status(502).json({ error: (data && data.error && data.error.message) || 'Could not analyze that photo. Please try again.' });
    }
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const keywords = text.split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 6);
    return res.status(200).json({ ok: true, keywords: keywords });
  } catch (err) {
    return res.status(502).json({ error: 'Could not reach the photo search service. Please try again.' });
  }
};
