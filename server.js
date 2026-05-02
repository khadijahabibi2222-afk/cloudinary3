require('dotenv').config();
const express     = require('express');
const mongoose    = require('mongoose');
const cors        = require('cors');
const path        = require('path');
const compression = require('compression');
const logger      = require('./lib/logger');

const app = express();

// ── HTTP logging (Morgan → Winston) ─────────────────────────
app.use(logger.httpMiddleware);

// ── Core middleware ──────────────────────────────────────────
app.use(compression());
app.use(cors());
// 10 MB limit — photos sent as base64 JSON before Cloudinary upload
// (base64 inflates ~33%: a 7MB photo → ~9.5MB payload)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Static files (1-day cache) ───────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1d', etag: true,
}));

// ── API Routes ───────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/orphans',  require('./routes/orphans'));
app.use('/api/schools',  require('./routes/schools'));
app.use('/api/sponsors', require('./routes/sponsors'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/kv',       require('./routes/kv'));

// ── Health endpoint ──────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const cache = require('./lib/cache');
  res.json({
    status:   'ok',
    version:  '4.0.0',
    uptime:   Math.floor(process.uptime()),
    cache:    cache.stats(),
    memory:   Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
    mongo:    mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ── Payload-too-large handler ─────────────────────────────
// Must come BEFORE the generic error handler
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'حجم عکس خیلی بزرگ است — لطفاً عکس کوچک‌تر انتخاب کنید (حداکثر ۷ مگابایت)',
    });
  }
  next(err);
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { err: err.message, url: req.originalUrl });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ── SPA fallback ─────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── MongoDB connection ───────────────────────────────────────
const PORT = process.env.PORT || 3000;

mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize:              50,   // ← 50 connections (was 10)
  minPoolSize:               5,   // keep 5 warm always
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS:         15000,  // fail faster (was 45s)
  heartbeatFrequencyMS:    10000,
  compressors:           'zlib',  // compress wire protocol
})
.then(async () => {
  logger.info('✅ MongoDB connected (pool: 50)');

  // Sync indexes (runs once at startup, skipped if unchanged)
  const Orphan = require('./models/Orphan');
  await Orphan.syncIndexes();
  logger.info('✅ Orphan indexes synced');

  // Auto-seed if no users exist (runs in all environments)
  const User  = require('./models/User');
  const count = await User.countDocuments();
  if (count === 0) {
    logger.warn('⚠️  No users found — auto-seeding default accounts...');
    try {
      const { seedUsers } = require('./seeds/seed');
      await seedUsers();
      logger.info('✅ Auto-seed complete. Change default passwords immediately!');
    } catch (seedErr) {
      logger.error('❌ Auto-seed failed — run manually: npm run seed', { err: seedErr.message });
    }
  }

  app.listen(PORT, () => logger.info(`🚀 Server running on port ${PORT}`));
})
.catch(err => {
  logger.error('❌ MongoDB connection failed', { err: err.message });
  process.exit(1);
});
