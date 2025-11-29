require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('Warning: STRIPE_SECRET_KEY not set');
}
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware - JSON parser must come before static files
app.use(express.json());

// Static files - serve after API routes are defined
app.use(express.static(__dirname));

// Servir index.html à la racine
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Fichier pour suivre les éditions vendues
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
app.get('/sold-editions', (req, res) => {
  const soldOut = loadSold();
  res.json(soldOut);
});

// Créer une session Stripe Checkout
app.post('/create-checkout-session', async (req, res) => {
  console.log('Checkout request received:', req.body);
  const { edition } = req.body;
  const soldOut = loadSold();

  if (soldOut.includes(Number(edition))) {
    return res.status(400).json({ error: 'Cette édition est déjà vendue.' });
  }

  try {
    console.log('Creating Stripe session for edition:', edition);
    console.log('Using BASE_URL:', process.env.BASE_URL);
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'chf',
          product_data: { name: `Carnet édition #${edition}` },
          unit_amount: 2000, // 20 CHF
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.BASE_URL || 'http://localhost:5000'}/success?edition=${edition}`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:5000'}/cancel`,
      metadata: { edition: String(edition) }
    });

    console.log('Session created:', session.id);
    console.log('Session URL:', session.url);
    res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    console.error('Full error:', err);
    res.status(500).json({ error: err.message || 'Impossible de créer la session' });
  }
});

// Webhook Stripe pour confirmer le paiement
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.WEBHOOK_SECRET);
  } catch (err) {
    console.log(`⚠️ Webhook signature failed.`, err.message);
    return res.sendStatus(400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const soldOut = loadSold();
    soldOut.push(Number(session.metadata.edition));
    saveSold(soldOut);
    console.log(`✅ Édition ${session.metadata.edition} vendue !`);
  }

  res.json({ received: true });
});

// Lancer le serveur
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
