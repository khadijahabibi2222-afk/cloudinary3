const router  = require('express').Router();
const jwt     = require('jsonwebtoken');
const bcrypt  = require('bcryptjs');
const User    = require('../models/User');
const auth    = require('../middleware/auth');

// ── Rate limiter: only FAILED attempts count ─────────────────
// Max 15 failed attempts per IP per 15 minutes.
// Successful login clears the counter for that IP.
const loginFails  = new Map();
const WINDOW_MS   = 15 * 60 * 1000;   // 15 min
const MAX_FAILS   = 15;

function _getIP(req) {
  // Render / proxies set X-Forwarded-For
  const fwd = req.headers['x-forwarded-for'];
  return (fwd ? fwd.split(',')[0] : null) || req.socket?.remoteAddress || 'unknown';
}

function _isBlocked(ip) {
  const rec = loginFails.get(ip);
  if (!rec) return false;
  if (Date.now() > rec.resetAt) { loginFails.delete(ip); return false; }
  return rec.count >= MAX_FAILS;
}

function _recordFail(ip) {
  const now = Date.now();
  const rec = loginFails.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (Date.now() > rec.resetAt) { rec.count = 0; rec.resetAt = now + WINDOW_MS; }
  rec.count++;
  loginFails.set(ip, rec);
}

function _clearFails(ip) {
  loginFails.delete(ip);
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    // 0. Rate limit — only failed logins count
    const ip = _getIP(req);
    if (_isBlocked(ip)) {
      return res.status(429).json({ error: 'تلاش‌های ناموفق زیاد — ۱۵ دقیقه صبر کنید' });
    }

    // 1. Extract + trim inputs (prevents whitespace login failures)
    const username = (req.body.username || '').trim().toLowerCase();
    const password = (req.body.password || '').trim();

    // 2. Basic validation
    if (!username || !password) {
      return res.status(400).json({ error: 'نام کاربری و رمز عبور الزامی است' });
    }
    if (username.length > 64 || password.length > 128) {
      return res.status(400).json({ error: 'ورودی نامعتبر' });
    }

    // 3. Find user — case-insensitive username match
    const user = await User.findOne({
      username: { $regex: new RegExp('^' + username + '$', 'i') }
    }).select('+password');

    if (!user) {
      // Constant-time response to prevent username enumeration
      await bcrypt.compare('dummy', '$2b$10$dummyhashpaddddddddddddddddddddddddddddddddddddddddddd');
      _recordFail(ip);
      return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
    }

    // 4. Compare password — bcrypt.compare (always awaited, never sync)
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      _recordFail(ip);
      return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
    }

    // 5. Successful login — clear fail counter for this IP
    _clearFails(ip);
    const payload = {
      id:       user._id,
      username: user.username,
      role:     user.role,
      fullName: user.fullName,
    };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user._id, username: user.username, role: user.role, fullName: user.fullName },
    });

  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'خطای سرور — لطفاً دوباره تلاش کنید' });
  }
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => res.json(req.user));

module.exports = router;
