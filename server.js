const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const stripeSecret = process.env.STRIPE_SECRET_KEY;
const stripePublishable =
  process.env.STRIPE_PUBLISHABLE_KEY ||
  'pk_test_51RFpQhKPIr5mBIf3A0LICBUWQjj0zTVdKHmMp7Wq6DuzGZnv5vtzgVotX6Jvas9PTlqgdaoGjryGnml6sq2AtbFe00HoUxAN5R';

const stripe = require('stripe')(stripeSecret);
const app = express();

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://7222clock.com';
const UNLOCK_PRICE_CENTS = 100;
const UNLOCK_COOKIE = 'mirtha_unlock';
const AUTH_COOKIE = 'mirtha_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  process.env.SESSION_SECRET ||
  stripeSecret ||
  'dev-insecure-secret';

if (!process.env.AUTH_SECRET && !process.env.SESSION_SECRET) {
  if (stripeSecret) {
    console.warn('MirthaNode: AUTH_SECRET/SESSION_SECRET not set; deriving auth secret from STRIPE_SECRET_KEY (set AUTH_SECRET in production).');
  } else {
    console.warn('MirthaNode: Using insecure default AUTH_SECRET. Set AUTH_SECRET in production.');
  }
}

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
  allowedHeaders: ['Content-Type'],
  credentials: true
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

function cookieSecureFlag() {
  return SITE_ORIGIN.startsWith('https');
}

function appendCookie(res, name, value, maxAge) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`
  ];
  if (cookieSecureFlag()) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearCookie(res, name) {
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0'
  ];
  if (cookieSecureFlag()) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function setUnlockCookie(res, sessionId) {
  appendCookie(res, UNLOCK_COOKIE, sessionId, COOKIE_MAX_AGE);
}

function clearUnlockCookie(res) {
  clearCookie(res, UNLOCK_COOKIE);
}

function setAuthCookie(res, email) {
  appendCookie(res, AUTH_COOKIE, signAuth(email), COOKIE_MAX_AGE);
}

function clearAuthCookie(res) {
  clearCookie(res, AUTH_COOKIE);
}

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

function signAuth(email) {
  const normalized = normalizeEmail(email);
  const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE;
  const payload = Buffer.from(JSON.stringify({ email: normalized, exp }), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyAuthCookie(req) {
  const cookies = parseCookies(req);
  const raw = cookies[AUTH_COOKIE];
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  const expected = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || !data.email || typeof data.exp !== 'number') return null;
    if (data.exp < Math.floor(Date.now() / 1000)) return null;
    return { email: normalizeEmail(data.email), exp: data.exp };
  } catch (_) {
    return null;
  }
}

function sessionLooksLikeAnalogUnlock(session) {
  if (!session || session.payment_status !== 'paid' || session.mode !== 'payment') {
    return false;
  }
  if (session.metadata && session.metadata.unlock === 'analog') return true;
  if (session.amount_total === UNLOCK_PRICE_CENTS) return true;
  if (session.amount_total === 722) return true; // legacy $7.22 test payments
  const name =
    (session.line_items &&
      session.line_items.data &&
      session.line_items.data[0] &&
      session.line_items.data[0].description) ||
    (session.metadata && session.metadata.product_name) ||
    '';
  if (typeof name === 'string' && /analog\s*unlock/i.test(name)) return true;
  return session.amount_total === UNLOCK_PRICE_CENTS || session.amount_total === 722 ||
    (session.metadata && session.metadata.unlock === 'analog');
}

async function expandSessionForUnlockCheck(session) {
  if (session.line_items && session.line_items.data) return session;
  try {
    return await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items']
    });
  } catch (_) {
    return session;
  }
}

async function emailHasAnalogUnlock(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !stripeSecret) return false;

  // Prefer Checkout Sessions Search when available
  try {
    const search = await stripe.checkout.sessions.search({
      query: `payment_status:"paid" AND customer_details.email:"${normalized.replace(/"/g, '')}"`,
      limit: 20
    });
    for (const session of search.data || []) {
      if (session.mode !== 'payment') continue;
      const full = await expandSessionForUnlockCheck(session);
      if (sessionLooksLikeAnalogUnlock(full)) return true;
      // Inclusive: any paid payment-mode session for this email restores unlock
      if (full.payment_status === 'paid' && full.mode === 'payment') return true;
    }
  } catch (err) {
    console.warn('MirthaNode: sessions.search unavailable, falling back:', err.message);
  }

  // Fallback: customers.list by email, then sessions for each customer
  try {
    const customers = await stripe.customers.list({ email: normalized, limit: 10 });
    for (const customer of customers.data || []) {
      const sessions = await stripe.checkout.sessions.list({
        customer: customer.id,
        limit: 20
      });
      for (const session of sessions.data || []) {
        if (session.payment_status !== 'paid' || session.mode !== 'payment') continue;
        const full = await expandSessionForUnlockCheck(session);
        if (sessionLooksLikeAnalogUnlock(full)) return true;
        if (full.payment_status === 'paid' && full.mode === 'payment') return true;
      }
    }
  } catch (err) {
    console.error('MirthaNode: emailHasAnalogUnlock fallback error:', err.message);
  }

  // Also scan recent paid sessions and match customer_details.email / customer_email
  try {
    const recent = await stripe.checkout.sessions.list({ limit: 50 });
    for (const session of recent.data || []) {
      if (session.payment_status !== 'paid' || session.mode !== 'payment') continue;
      const sessionEmail = normalizeEmail(
        (session.customer_details && session.customer_details.email) ||
        session.customer_email ||
        ''
      );
      if (sessionEmail !== normalized) continue;
      const full = await expandSessionForUnlockCheck(session);
      if (sessionLooksLikeAnalogUnlock(full) || (full.payment_status === 'paid' && full.mode === 'payment')) {
        return true;
      }
    }
  } catch (err) {
    console.error('MirthaNode: emailHasAnalogUnlock recent-scan error:', err.message);
  }

  return false;
}

// In-memory rate limit: 10 attempts / 15 min per IP
const signInAttempts = new Map();
const SIGNIN_WINDOW_MS = 15 * 60 * 1000;
const SIGNIN_MAX = 10;

function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf && typeof xf === 'string') return xf.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

function rateLimitSignIn(req) {
  const ip = clientIp(req);
  const now = Date.now();
  let entry = signInAttempts.get(ip);
  if (!entry || now - entry.start > SIGNIN_WINDOW_MS) {
    entry = { start: now, count: 0 };
    signInAttempts.set(ip, entry);
  }
  entry.count += 1;
  return entry.count <= SIGNIN_MAX;
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
    const auth = verifyAuthCookie(req);

    // Legacy browser cookie unlock
    if (sessionId) {
      try {
        const unlocked = await sessionIsPaid(sessionId);
        if (unlocked) {
          const email = auth ? auth.email : null;
          res.status(200).json({ unlocked: true, email, sessionId });
          return;
        }
        clearUnlockCookie(res);
      } catch (err) {
        console.warn('MirthaNode: legacy session check failed:', err.message);
        clearUnlockCookie(res);
      }
    }

    // Email auth cookie unlock
    if (auth && auth.email) {
      const hasUnlock = await emailHasAnalogUnlock(auth.email);
      if (hasUnlock) {
        res.status(200).json({ unlocked: true, email: auth.email });
        return;
      }
      clearAuthCookie(res);
    }

    res.status(200).json({ unlocked: false, email: null });
  } catch (error) {
    console.error('MirthaNode: entitlement error:', error.message);
    clearUnlockCookie(res);
    clearAuthCookie(res);
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
      customer_creation: 'always',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: '7222 Clock Analog Unlock',
            description: 'One-time unlock of the analog Mirtha clock (follows your email across devices)',
            metadata: { unlock: 'analog' }
          },
          unit_amount: UNLOCK_PRICE_CENTS
        },
        quantity: 1
      }],
      metadata: { unlock: 'analog' },
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
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const unlocked = session.payment_status === 'paid' && session.mode === 'payment';
    let email = null;

    if (unlocked) {
      setUnlockCookie(res, sessionId);
      email = normalizeEmail(
        (session.customer_details && session.customer_details.email) ||
        session.customer_email ||
        ''
      );
      if (email) {
        setAuthCookie(res, email);
      }
    }

    res.status(200).json({
      unlocked,
      payment_status: session.payment_status,
      status: session.status,
      sessionId: unlocked ? sessionId : null,
      email: unlocked ? email : null
    });
  } catch (error) {
    console.error('MirthaNode: complete-checkout error:', error.message);
    res.status(500).json({ unlocked: false, error: error.message || 'Unable to complete checkout.' });
  }
});

app.post('/auth/signin', async (req, res) => {
  if (!stripeSecret) {
    res.status(500).json({ unlocked: false, error: 'Stripe is not configured on the server.' });
    return;
  }

  if (!rateLimitSignIn(req)) {
    res.status(429).json({ unlocked: false, error: 'Too many sign-in attempts. Try again later.' });
    return;
  }

  const email = normalizeEmail(req.body && req.body.email);
  if (!email || !email.includes('@')) {
    res.status(400).json({ unlocked: false, error: 'Valid email required' });
    return;
  }

  try {
    const hasUnlock = await emailHasAnalogUnlock(email);
    if (!hasUnlock) {
      res.status(404).json({ unlocked: false, error: 'No unlock found for that email' });
      return;
    }
    setAuthCookie(res, email);
    res.status(200).json({ unlocked: true, email });
  } catch (error) {
    console.error('MirthaNode: signin error:', error.message);
    res.status(500).json({ unlocked: false, error: error.message || 'Sign-in failed.' });
  }
});

app.post('/auth/signout', (req, res) => {
  clearAuthCookie(res);
  clearUnlockCookie(res);
  res.status(200).json({ unlocked: false, email: null });
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
  console.log('MirthaNode: AUTH_SECRET:', process.env.AUTH_SECRET ? 'From env' : (process.env.SESSION_SECRET ? 'From SESSION_SECRET' : 'Fallback'));
});
