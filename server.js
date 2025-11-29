require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

if (!process.env.STRIPE_SECRET_KEY) console.error('⚠️ STRIPE_SECRET_KEY not set');
if (!process.env.WEBHOOK_SECRET) console.warn('⚠️ WEBHOOK_SECRET not set - webhook signature verification may fail');
if (!process.env.BASE_URL) console.warn('⚠️ BASE_URL not set - success/cancel URLs may fail');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();

// --- Webhook Stripe (raw body required)
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.WEBHOOK_SECRET);
  } catch (err) {
    console.error('⚠️ Webhook signature failed', err.message);
    return res.sendStatus(400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Marquer l'édition comme vendue
    const soldOut = loadSold();
    if (session.metadata && session.metadata.edition) {
      soldOut.push(Number(session.metadata.edition));
      saveSold(soldOut);
      console.log(`✅ Édition ${session.metadata.edition} vendue !`);
    }

    // Sauvegarder la commande complète
    const orders = loadOrders();
    const order = {
      edition: session.metadata ? Number(session.metadata.edition) : null,
      session_id: session.id,
      amount_total: session.amount_total || null,
      currency: session.currency || null,
      customer_email: (session.customer_details && session.customer_details.email) || session.customer_email || null,
      shipping: session.shipping || null,
      comment: session.metadata ? (session.metadata.comment || '') : '',
      created: new Date().toISOString()
    };
    orders.push(order);
    saveOrders(orders);
    console.log('Order saved:', order);
  }

  res.json({ received: true });
});

// --- Middleware JSON pour toutes les autres routes
app.use(express.json());

// --- Fichiers statiques
app.use(express.static(__dirname));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// --- Pages success / cancel
app.get('/success', (req, res) => {
  res.send(`
    <h1>Payment successful</h1>
    <p>Thank you! Your order has been recorded.</p>
    <p><a href="/">Back to shop</a></p>
  `);
});
app.get('/cancel', (req, res) => {
  res.send(`
    <h1>Payment canceled</h1>
    <p>Your payment was canceled.</p>
    <p><a href="/">Back to shop</a></p>
  `);
});

// --- Fichiers pour éditions vendues et commandes
const FILE_EDITIONS = path.join(__dirname, 'sold_editions.json');
const FILE_ORDERS = path.join(__dirname, 'orders.json');

function loadSold() {
  if (!fs.existsSync(FILE_EDITIONS)) return [];
  const data = fs.readFileSync(FILE_EDITIONS);
  try { return JSON.parse(data); } catch { return []; }
}
function saveSold(editions) {
  fs.writeFileSync(FILE_EDITIONS, JSON.stringify(editions, null, 2));
}

function loadOrders() {
  if (!fs.existsSync(FILE_ORDERS)) return [];
  const data = fs.readFileSync(FILE_ORDERS);
  try { return JSON.parse(data); } catch { return []; }
}
function saveOrders(orders) {
  fs.writeFileSync(FILE_ORDERS, JSON.stringify(orders, null, 2));
}

// --- Endpoints API
app.get('/sold-editions', (req, res) => res.json(loadSold()));
app.get('/orders', (req, res) => res.json(loadOrders()));

// --- Créer une session Stripe Checkout
app.post('/create-checkout-session', async (req, res) => {
  const { edition } = req.body;
  const soldOut = loadSold();

  if (!edition) return res.status(400).json({ error: 'Edition required' });
  if (soldOut.includes(Number(edition))) return res.status(400).json({ error: 'This edition is already sold.' });

  try {
    const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{
    price_data: {
      currency: 'chf',
      product_data: { name: `édition #${edition}` },
      unit_amount: 700, // 7 CHF
    },
    quantity: 1,
  }],
  mode: 'payment',

  // URLs pointant vers les fichiers statiques
  success_url: `${process.env.BASE_URL}/success.html`,
  cancel_url: `${process.env.BASE_URL}/cancel.html`,

  billing_address_collection: 'required',
  shipping_address_collection: {
    allowed_countries: ['CH','FR','DE','IT']
  },

  metadata: { edition: String(edition) },

  custom_fields: [
    {
      key: 'comment',
      label: { type: 'custom', custom: 'Optional comment' },
      type: 'text',
      optional: true
    }
  ],

  allow_promotion_codes: true
});

    res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message || 'Could not create session' });
  }
});

// --- Lancer serveur
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
