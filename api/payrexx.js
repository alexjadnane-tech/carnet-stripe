import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { edition } = req.body;
  if (!edition) return res.status(400).json({ error: 'Edition manquante' });

  try {
    const baseUrl = process.env.BASE_URL || `https://${req.headers.host}`;

    const response = await fetch(`https://${process.env.PAYREXX_INSTANCE}.payrexx.com/api/v1.0/Payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.PAYREXX_API_KEY,
        amount: 700, // 7 CHF
        currency: 'CHF',
        description: `Carnet édition #${edition}`,
        purpose: `Edition ${edition}`,
        success_redirect_url: `${baseUrl}/success.html?edition=${edition}`,
        failed_redirect_url: `${baseUrl}/cancel.html`,
        fields: {
          name: true,
          email: true,
          phone: true,
          address: true,
          country: true,
          comment: true
        }
      })
    });

    const data = await response.json();

    if (!data.data || !data.data.link) {
      return res.status(500).json({ error: 'Erreur Payrexx', details: data });
    }

    res.status(200).json({ url: data.data.link });
  } catch (err) {
    console.error('Payrexx error', err);
    res.status(500).json({ error: err.message });
  }
}
