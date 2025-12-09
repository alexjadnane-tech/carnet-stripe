require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 5000;

// --- Fichiers JSON
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

// --- Pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/success', (req, res) => res.send(`<h1>Payment successful</h1><p><a href="/">Back to shop</a></p>`));
app.get('/cancel', (req, res) => res.send(`<h1>Payment canceled</h1><p><a href="/">Back to shop</a></p>`));

// --- API pour éditions vendues
app.get('/sold-editions', (req, res) => res.json(loadSold()));
app.post('/api/mark-sold', (req, res) => {
  const { edition } = req.body;
  const soldOut = loadSold();
  if (!soldOut.includes(Number(edition))) {
    soldOut.push(Number(edition));
    saveSold(soldOut);
  }
  res.json({ ok: true });
});

// --- API Payrexx
app.post('/api/payrexx', async (req, res) => {
  const { edition } = req.body;
  if (!edition) return res.status(400).json({ error: 'Edition manquante' });

  try {
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const response = await fetch(`https://${process.env.PAYREXX_INSTANCE}.payrexx.com/api/v1.0/Payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.PAYREXX_API_KEY,
        amount: 700,
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
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
