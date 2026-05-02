const router = require('express').Router();
const User   = require('../models/User');
const auth   = require('../middleware/auth');
const { body, handle } = require('../middleware/validate');
const logger = require('../lib/logger');

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

const userRules = [
  body('username').trim().notEmpty().isLength({ min: 2, max: 64 }).withMessage('Username 2–64 chars'),
  body('fullName').trim().notEmpty().isLength({ max: 128 }),
  body('role').isIn(['admin','editor','viewer']).withMessage('Invalid role'),
];

router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({}).select('-password').lean();
    res.json(users.map(u => ({ id: u._id.toString(), username: u.username, fullName: u.fullName, role: u.role })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, adminOnly, [...userRules, body('password').isLength({ min: 6, max: 128 }), handle], async (req, res) => {
  try {
    const { username, password, fullName, role } = req.body;
    const exists = await User.findOne({ username: username.toLowerCase() });
    if (exists) return res.status(409).json({ error: 'Username already exists' });
    const user = await User.create({ username, password, fullName, role });
    logger.info('User created', { username, role, by: req.user.username });
    res.status(201).json({ id: user._id, username, fullName, role });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, adminOnly, [...userRules, handle], async (req, res) => {
  try {
    const { username, password, fullName, role } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    if (username) user.username = username;
    if (fullName) user.fullName = fullName;
    if (role)     user.role     = role;
    if (password) {
      if (password.length < 6) return res.status(400).json({ error: 'Password min 6 chars' });
      user.password = password;
    }
    await user.save();
    logger.info('User updated', { id: req.params.id, by: req.user.username });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (req.user.id.toString() === req.params.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    await User.findByIdAndDelete(req.params.id);
    logger.info('User deleted', { id: req.params.id, by: req.user.username });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
