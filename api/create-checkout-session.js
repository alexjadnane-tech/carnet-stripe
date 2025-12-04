import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { edition } = req.body;
  if (!edition) return res.status(400).json({ error: 'Edition manquante' });

  try {
    const baseUrl = process.env.BASE_URL; // https://carnet-stripe.vercel.app
    if (!baseUrl) return res.status(500).json({ error: 'BASE_URL non défini' });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'chf',
          product_data: { name: `Carnet édition #${edition}` },
          unit_amount: 700,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${baseUrl}/success.html?edition=${edition}`,
      cancel_url: `${baseUrl}/cancel.html`,
      metadata: { edition: String(edition) },
      shipping_address_collection: {
        allowed_countries: ['CH', 'FR', 'DE', 'IT']
      },
      custom_fields: [
        {
          key: 'comment',
          label: { type: 'custom', custom: 'Commentaire (optionnel)' },
          type: 'text',
          optional: true
        }
      ]
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Erreur create-checkout-session:', err);
    res.status(500).json({ error: err.message });
  }
}
