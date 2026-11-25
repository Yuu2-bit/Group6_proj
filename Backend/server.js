require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const requireAuth = require('./src/middleware/auth');
const errorHandler = require('./src/middleware/errorHandler');

const app = express();

// Needed on Vercel (and other hosts behind a proxy) so the rate limiter sees the real IP
app.set('trust proxy', 1);

// CSP is off because the frontend uses inline onclick handlers and CDN scripts
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  credentials: false
}));
app.use(express.json({ limit: '1mb' }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

// Public
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Everything below needs a login
app.use('/api', requireAuth);
app.get('/api/me', (req, res) => res.json(req.user));
app.use('/api/meta', require('./src/routes/meta'));
app.use('/api/dashboard', require('./src/routes/dashboard'));
app.use('/api/customers', require('./src/routes/customers'));
app.use('/api/job-orders', require('./src/routes/jobOrders'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/inventory', require('./src/routes/inventory'));
app.use('/api/reports', require('./src/routes/reports'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Optional: serve the frontend from the same server (local use; leave STATIC_DIR empty on Vercel)
if (process.env.STATIC_DIR) app.use(express.static(path.resolve(process.env.STATIC_DIR)));

app.use(errorHandler);

// Local: "npm run dev" starts the server.
// Vercel: it imports the exported app instead, so it must not call listen().
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log('Ryzentech API running on http://localhost:' + port));
}

module.exports = app;