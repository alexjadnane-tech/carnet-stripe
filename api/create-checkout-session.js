import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { edition, comment, phone, shippingCountry } = req.body;
  if (!edition) return res.status(400).json({ error: 'edition manquante' });

  try {
    const baseUrl = req.headers.origin || `https://${process.env.VERCEL_URL}`;

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
      metadata: {
        edition: String(edition),
        comment: comment || '',
        phone: phone || '',
        shippingCountry: shippingCountry || '',
      },
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['CH','FR','DE','IT']
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('create-checkout-session error', err);
    res.status(500).json({ error: err.message });
  }
}
