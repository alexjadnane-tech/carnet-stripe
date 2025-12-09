import fetch from 'node-fetch';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { edition, comment, phone, shippingCountry } = req.body;
  if (!edition) return res.status(400).json({ error: 'edition manquante' });

  try {
    const baseUrl = req.headers.origin || `https://${process.env.VERCEL_URL}`;

    // Création d’un paiement Payrexx
    const response = await fetch(`https://${process.env.PAYREXX_INSTANCE}.payrexx.com/api/v1.0/Payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.PAYREXX_API_KEY,
        amount: 700, // CHF 7 → Payrexx demande montant en centimes
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
