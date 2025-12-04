const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{
    price_data: {
      currency: 'chf',
      product_data: { name: `edition #${edition}` },
      unit_amount: 700,
    },
    quantity: 1,
  }],
  mode: 'payment',
  success_url: `${baseUrl}/success.html?edition=${edition}`,
  cancel_url: `${baseUrl}/cancel.html`,
  metadata: { edition: String(edition) },

  billing_address_collection: 'required',
  shipping_address_collection: { allowed_countries: ['CH','FR','DE','IT'] },

  phone_number_collection: { enabled: true }, // ✅ numéro obligatoire

  custom_fields: [
    {
      key: 'comment',
      label: { type: 'custom', custom: 'Commentaire (optionnel)' },
      type: 'text',
      optional: true
    }
  ]
});
