// /api/webhook.js
import Stripe from 'stripe';

export const config = { api: { bodyParser: false } };

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  const raw = await buffer(req);

  try {
    const event = stripe.webhooks.constructEvent(raw, sig, process.env.WEBHOOK_SECRET);

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      console.log('Payment succeeded for edition:', session.metadata?.edition);
      // Ici on pourrait appeler un service externe (Supabase, Airtable, etc.)
      // ou envoyer une notification. On laisse la source de vérité dans Stripe.
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
}
