require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const FILE_EDITIONS = path.join(__dirname, 'sold_editions.json');

function loadSold() {
  if (!fs.existsSync(FILE_EDITIONS)) return [];
  const data = fs.readFileSync(FILE_EDITIONS);
  return JSON.parse(data);
}

function saveSold(editions) {
  fs.writeFileSync(FILE_EDITIONS, JSON.stringify(editions, null, 2));
}

// Endpoint pour récupérer les éditions vendues
app.get('/api/sold-editions', (req, res) => {
  const soldOut = loadSold();
  res.json(soldOut);
});

// Créer une session Stripe Checkout
app.post('/api/create-checkout-session', async (req, res) => {
  const { edition, comment } = req.body;
  const soldOut = loadSold();

  if (soldOut.some(e => e.edition === Number(edition))) {
    return res.status(400).json({ error: 'This edition is already sold.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'chf',
          product_data: { name: `Carnet édition #${edition}` },
          unit_amount: 700, // 7 CHF en centimes
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.BASE_URL}/success?edition=${edition}`,
      cancel_url: `${process.env.BASE_URL}/cancel`,
      shipping_address_collection: {
        allowed_countries: ['CH', 'FR', 'DE'] // tu peux ajouter d'autres pays
      },
      metadata: {
        edition: String(edition),
        comment: comment || ''
      }
    });

    res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create checkout session.' });
  }
});

// Webhook Stripe pour confirmer le paiement
app.post('/api/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.WEBHOOK_SECRET);
  } catch (err) {
    console.log('Webhook signature failed.', err.message);
    return res.sendStatus(400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Ajouter édition vendue + info livraison + commentaire
    const soldOut = loadSold();
    soldOut.push({
      edition: Number(session.metadata.edition),
      comment: session.metadata.comment,
      shipping: session.shipping || {}
    });
    saveSold(soldOut);

    console.log(`✅ Edition ${session.metadata.edition} sold!`);
    console.log('Shipping info:', session.shipping);
    console.log('Comment:', session.metadata.comment);
  }

  res.json({ received: true });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
