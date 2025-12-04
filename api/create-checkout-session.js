// /api/create-checkout-session.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { edition } = req.body;
  if (!edition) return res.status(400).json({ error: 'edition manquante' });

  try {
    // baseUrl fiable (frontend <-> backend sur vercel)
  const baseUrl = process.env.BASE_URL; // fiable pour Stripe
  const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{
    price_data: {
      currency: 'chf',
      product_data: { name: `Carnet édition #${edition}` },
      unit_amount: 2000,
    },
    quantity: 1,
  }],
  mode: 'payment',
  success_url: `${baseUrl}/success.html?edition=${edition}`,
  cancel_url: `${baseUrl}/cancel.html`,
  metadata: { edition: String(edition) },
});


    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err);
    res.status(500).json({ error: err.message });
  }
}
