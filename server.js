const express = require('express');
const cors = require('cors');
const path = require('path');

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripePublishable =
  process.env.STRIPE_PUBLISHABLE_KEY ||
  'pk_test_51RFpQhKPIr5mBIf3A0LICBUWQjj0zTVdKHmMp7Wq6DuzGZnv5vtzgVotX6Jvas9PTlqgdaoGjryGnml6sq2AtbFe00HoUxAN5R';

const stripe = require('stripe')(stripeSecret);
const app = express();

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://7222clock.com';
const UNLOCK_PRICE_CENTS = 722;
const UNLOCK_COOKIE = 'mirtha_unlock';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

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

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

function setUnlockCookie(res, sessionId) {
  const secure = SITE_ORIGIN.startsWith('https');
  const parts = [
    `${UNLOCK_COOKIE}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${COOKIE_MAX_AGE}`
  ];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearUnlockCookie(res) {
  const secure = SITE_ORIGIN.startsWith('https');
  const parts = [
    `${UNLOCK_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

async function sessionIsPaid(sessionId) {
  if (!sessionId) return false;
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return session.payment_status === 'paid' && session.mode === 'payment';
}

app.get('/stripe-config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.STRIPE_PUBLISHABLE_KEY = ${JSON.stringify(stripePublishable)};`);
});

app.get('/favicon.ico', (req, res) => {
  res.type('image/jpeg');
  res.sendFile(path.join(__dirname, 'images', 'favicon7222.jpeg'));
});

app.get('/success', (req, res) => {
  res.sendFile(path.join(__dirname, 'success.html'));
});

app.get('/cancel', (req, res) => {
  res.sendFile(path.join(__dirname, 'cancel.html'));
});

app.get('/entitlement', async (req, res) => {
  if (!stripeSecret) {
    res.status(500).json({ unlocked: false, error: 'Stripe is not configured on the server.' });
    return;
  }

  try {
    const cookies = parseCookies(req);
    const sessionId = cookies[UNLOCK_COOKIE];
    if (!sessionId) {
      res.status(200).json({ unlocked: false });
      return;
    }

    const unlocked = await sessionIsPaid(sessionId);
    if (!unlocked) {
      clearUnlockCookie(res);
    }
    res.status(200).json({ unlocked, sessionId: unlocked ? sessionId : null });
  } catch (error) {
    console.error('MirthaNode: entitlement error:', error.message);
    clearUnlockCookie(res);
    res.status(200).json({ unlocked: false });
  }
});

app.post('/create-checkout-session', async (req, res) => {
  if (!stripeSecret) {
    res.status(500).json({ error: 'Stripe is not configured on the server.' });
    return;
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: '7222 Clock Analog Unlock',
            description: 'One-time unlock of the analog Mirtha clock on this browser'
          },
          unit_amount: UNLOCK_PRICE_CENTS
        },
        quantity: 1
      }],
      success_url: `${SITE_ORIGIN}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_ORIGIN}/cancel`
    });

    console.log('MirthaNode: One-time checkout created:', session.id);
    res.status(200).json({ id: session.id, url: session.url });
  } catch (error) {
    console.error('MirthaNode: Stripe checkout error:', error.message);
    res.status(500).json({ error: error.message || 'Unable to create checkout session.' });
  }
});

app.post('/complete-checkout', async (req, res) => {
  if (!stripeSecret) {
    res.status(500).json({ unlocked: false, error: 'Stripe is not configured on the server.' });
    return;
  }

  const sessionId = req.body && req.body.session_id;
  if (!sessionId) {
    res.status(400).json({ unlocked: false, error: 'Missing session_id' });
    return;
  }

  try {
    const unlocked = await sessionIsPaid(sessionId);
    if (unlocked) {
      setUnlockCookie(res, sessionId);
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    res.status(200).json({
      unlocked,
      payment_status: session.payment_status,
      status: session.status,
      sessionId: unlocked ? sessionId : null
    });
  } catch (error) {
    console.error('MirthaNode: complete-checkout error:', error.message);
    res.status(500).json({ unlocked: false, error: error.message || 'Unable to complete checkout.' });
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
      status: session.status,
      mode: session.mode
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
