// /api/sold-editions.js
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  try {
    // Récupère les sessions checkout (limit 100 ; tu peux paginer si beaucoup)
    const sessions = await stripe.checkout.sessions.list({ limit: 100 });
    // Filtre celles complétées et qui ont metadata.edition
    const sold = sessions.data
      .filter(s => s.payment_status === 'paid' && s.metadata && s.metadata.edition)
      .map(s => Number(s.metadata.edition));

    // Return unique sorted
    const unique = Array.from(new Set(sold)).sort((a,b) => a-b);
    res.status(200).json(unique);
  } catch (err) {
    console.error('sold-editions error', err);
    res.status(500).json({ error: err.message });
  }
}
