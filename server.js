const express = require('express');
const cors = require('cors');
const path = require('path');

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripePublishable =
  process.env.STRIPE_PUBLISHABLE_KEY ||
  'pk_live_51RFpQhKPIr5mBIf30u1030sWukrw4eqfd8jlMVrGQ5un6H9TL8O7Iz1lHa5s27AxZ4XInvJRblgd94yzAcv0idIk00R8vLeFAG';

const stripe = require('stripe')(stripeSecret);
const app = express();

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://7222clock.com';
const ALLOWED_ORIGINS = [
  'https://7222clock.com',
  'https://www.7222clock.com',
  SITE_ORIGIN
];

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

app.use((req, res, next) => {
  console.log(`MirthaNode: ${req.method} ${req.url}`);
  next();
});

app.get('/stripe-config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.STRIPE_PUBLISHABLE_KEY = ${JSON.stringify(stripePublishable)};`);
});

app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'success.html'));
});

app.get('/cancel', (req, res) => {
  res.sendFile(path.join(__dirname, 'cancel.html'));
});

app.post('/create-checkout-session', async (req, res) => {
  if (!stripeSecret) {
    res.status(500).json({ error: 'Stripe is not configured on the server.' });
    return;
  }

  const rawAmount = Number(req.body && req.body.amount);
  const amount = Number.isFinite(rawAmount) ? Math.round(rawAmount) : 500;
  if (amount < 100 || amount > 100000) {
    res.status(400).json({ error: 'Amount must be between $1 and $1000.' });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: '7222 Clock donation' },
          unit_amount: amount
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${SITE_ORIGIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_ORIGIN}/cancel`
    });

    console.log('MirthaNode: Checkout session created:', session.id);
    res.status(200).json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('MirthaNode: Stripe checkout error:', error.message);
    res.status(500).json({ error: error.message || 'Unable to create checkout session.' });
  }
});

app.get('/test-session/:sessionId', async (req, res) => {
  if (!stripeSecret) {
    res.status(500).json({ error: 'Stripe is not configured on the server.' });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.status(200).json({
      id: session.id,
      payment_status: session.payment_status,
      status: session.status
    });
  } catch (error) {
    console.error('MirthaNode: Retrieve session error:', error.message);
    res.status(500).json({ error: error.message || 'Unable to retrieve session.' });
  }
});

app.use(express.static('.'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MirthaNode: Server running on port ${PORT}`);
  console.log('MirthaNode: STRIPE_SECRET_KEY:', stripeSecret ? 'Loaded' : 'Not loaded');
  console.log('MirthaNode: STRIPE_PUBLISHABLE_KEY:', process.env.STRIPE_PUBLISHABLE_KEY ? 'From env' : 'Using fallback');
});
