require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('Warning: STRIPE_SECRET_KEY not set');
}
if (!process.env.WEBHOOK_SECRET) {
  console.warn('Warning: WEBHOOK_SECRET not set - webhook signature verification will fail if not configured');
}
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Webhook Stripe pour confirmer le paiement
// IMPORTANT: this route MUST be defined before express.json() so we can access the raw body
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

    // Enregistrer l'édition vendue
    const soldOut = loadSold();
    if (session.metadata && session.metadata.edition) {
      soldOut.push(Number(session.metadata.edition));
      saveSold(soldOut);
      console.log(`✅ Édition ${session.metadata.edition} vendue !`);
    }

    // Enregistrer la commande complète (édition, commentaire, email, adresse shipping si fournie)
    const orders = loadOrders();
    const order = {
      edition: session.metadata ? Number(session.metadata.edition) : null,
      comment: session.metadata ? (session.metadata.comment || '') : '',
      session_id: session.id,
      amount_total: session.amount_total || null,
      currency: session.currency || null,
      customer_email: (session.customer_details && session.customer_details.email) || session.customer_email || null,
      shipping: session.shipping || null,
      created: new Date().toISOString()
    };
    orders.push(order);
    saveOrders(orders);
    console.log('Order saved:', order);
  }

  res.json({ received: true });
});

// Middleware - JSON parser for all other routes (must be AFTER webhook so webhook can use raw body)
app.use(express.json());

// Servir fichiers statiques (index.html fourni ci‑dessous)
app.use(express.static(__dirname));

// Servir index.html explicitement
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Pages simples success / cancel
app.get('/success', (req, res) => {
  res.send(`
    <h1>Paiement réussi</h1>
    <p>Merci ! La commande est enregistrée.</p>
    <p><a href="/">Retour à la boutique</a></p>
  `);
});
app.get('/cancel', (req, res) => {
  res.send(`
    <h1>Paiement annulé</h1>
    <p>Le paiement a été annulé.</p>
    <p><a href="/">Retour à la boutique</a></p>
  `);
});

// Fichiers pour suivre les éditions vendues et les commandes
const FILE_EDITIONS = path.join(__dirname, 'sold_editions.json');
const FILE_ORDERS = path.join(__dirname, 'orders.json');

function loadSold() {
  if (!fs.existsSync(FILE_EDITIONS)) return [];
  const data = fs.readFileSync(FILE_EDITIONS);
  try { return JSON.parse(data); } catch (e) { return []; }
}

function saveSold(editions) {
  fs.writeFileSync(FILE_EDITIONS, JSON.stringify(editions, null, 2));
}

function loadOrders() {
  if (!fs.existsSync(FILE_ORDERS)) return [];
  const data = fs.readFileSync(FILE_ORDERS);
  try { return JSON.parse(data); } catch (e) { return []; }
}

function saveOrders(orders) {
  fs.writeFileSync(FILE_ORDERS, JSON.stringify(orders, null, 2));
}

// Endpoint pour récupérer les éditions vendues
app.get('/sold-editions', (req, res) => {
  const soldOut = loadSold();
  res.json(soldOut);
});

// Endpoint pour récupérer les commandes (utile pour administration)
app.get('/orders', (req, res) => {
  const orders = loadOrders();
  res.json(orders);
});

// Créer une session Stripe Checkout
app.post('/create-checkout-session', async (req, res) => {
  console.log('Checkout request received:', req.body);
  const { edition, comment } = req.body;
  const soldOut = loadSold();

  if (typeof edition === 'undefined') {
    return res.status(400).json({ error: 'Le champ edition est requis.' });
  }

  if (soldOut.includes(Number(edition))) {
    return res.status(400).json({ error: 'Cette édition est déjà vendue.' });
  }

  try {
    // Montant en centimes/rappen (700 => 7.00 CHF)
    const PRICE_AMOUNT = 700; // <-- 7.00 CHF

    console.log('Creating Stripe session for edition:', edition);
    console.log('Using BASE_URL:', process.env.BASE_URL);
    console.log('PRICE_AMOUNT (smallest currency unit):', PRICE_AMOUNT);
    console.log('Received comment:', comment);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'chf',
          product_data: { name: `édition #${edition}` },
          unit_amount: PRICE_AMOUNT,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${process.env.BASE_URL || 'http://localhost:5000'}/success?edition=${edition}`,
      cancel_url: `${process.env.BASE_URL || 'http://localhost:5000'}/cancel`,

      // On stocke l'édition et le commentaire dans metadata pour le récupérer ensuite via le webhook
      metadata: {
        edition: String(edition),
        comment: comment ? String(comment).slice(0, 1024) : ''
      },

      // Collecte l'adresse de facturation (obligatoire)
      billing_address_collection: 'required',

      // Collecte d'adresse de livraison si besoin (ajuster la liste)
      shipping_address_collection: {
        allowed_countries: ['CH', 'FR', 'DE', 'IT', 'GB', 'US']
      },

      // Autoriser les codes promo si vous en avez
      allow_promotion_codes: true
    });

    // Debug: afficher le montant total calculé par Stripe après création de la session
    console.log('Session created:', session.id);
    console.log('Session URL:', session.url);
    console.log('Session amount_total:', session.amount_total, 'currency:', session.currency);

    res.json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message || err);
    console.error('Full error:', err);
    res.status(500).json({ error: err.message || 'Impossible de créer la session' });
  }
});

// Lancer le serveur
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
