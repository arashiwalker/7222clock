const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const app = express();

// Middleware
app.use(cors({
    origin: 'https://7222clock.com',
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());
// Log all requests
app.use((req, res, next) => {
    console.log(`MirthaNode: Request received: ${req.method} ${req.url}`);
    next();
});

// Specific route for /success to handle query parameters
app.get('/success', (req, res) => {
    console.log('MirthaNode: Handling /success route');
    console.log('MirthaNode: Query parameters:', req.query);
    const filePath = path.join(__dirname, 'success.html');
    console.log('MirthaNode: Attempting to serve:', filePath);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('MirthaNode: Error serving success.html:', err);
            res.status(404).send('Success page not found');
        }
    });
});

// Specific route for /cancel to handle query parameters
app.get('/cancel', (req, res) => {
    console.log('MirthaNode: Handling /cancel route');
    console.log('MirthaNode: Query parameters:', req.query);
    const filePath = path.join(__dirname, 'cancel.html');
    console.log('MirthaNode: Attempting to serve:', filePath);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error('MirthaNode: Error serving cancel.html:', err);
            res.status(404).send('Cancel page not found');
        }
    });
});

// Serve static files after specific routes
app.use(express.static('.'));

// Log server start
console.log('MirthaNode: STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'Loaded' : 'Not loaded');

// Stripe Checkout Session Endpoint
app.post('/create-checkout-session', async (req, res) => {
    console.log('MirthaNode: Received request to /create-checkout-session');
    console.log('MirthaNode: Request body:', req.body);
    try {
        console.log('MirthaNode: Creating Stripe Checkout session with amount:', req.body.amount);
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: { name: 'Donation' },
                    unit_amount: req.body.amount || 500 // Default $5
                },
                quantity: 1
            }],
            mode: 'payment',
            success_url: 'https://7222clock.com/success.html?session_id={CHECKOUT_SESSION_ID}',
            cancel_url: 'https://7222clock.com/cancel.html',
            expires_at: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // Expire in 24 hours
        });
        console.log('MirthaNode: Session created:', session.id, 'Expires at:', new Date(session.expires_at * 1000));
        console.log('MirthaNode: Full session details:', JSON.stringify(session, null, 2));
        res.status(200).json({ id: session.id });
    } catch (error) {
        console.error('MirthaNode: Stripe error:', error.message, error.stack);
        console.error('MirthaNode: Stripe error details:', JSON.stringify(error, null, 2));
        res.status(500).json({ error: error.message });
    }
});

// Test endpoint to retrieve a session
app.get('/test-session/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    console.log('MirthaNode: Received request to retrieve session:', sessionId);
    try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        console.log('MirthaNode: Retrieved session:', JSON.stringify(session, null, 2));
        res.status(200).json(session);
    } catch (error) {
        console.error('MirthaNode: Retrieve session error:', error.message, error.stack);
        res.status(500).json({ error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`MirthaNode: Server running on port ${PORT}`);
    console.log('MirthaNode: Environment PORT:', process.env.PORT || 'Not set, using default 3000');
});