const router = require('express').Router();
const School = require('../models/School');
const auth   = require('../middleware/auth');
const cache  = require('../lib/cache');
const { body, handle } = require('../middleware/validate');
const TTL = 120;

router.get('/', auth, async (req, res) => {
  try {
    const cached = await cache.get('schools:list');
    if (cached) return res.json(cached);
    const data = await School.find({}, { __v: 0 }).lean();
    await cache.set('schools:list', data, TTL);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, [
  body('id').trim().notEmpty(),
  body('name').trim().notEmpty().isLength({ max: 200 }),
  handle,
], async (req, res) => {
  try {
    await School.updateOne({ id: req.body.id }, { $set: req.body }, { upsert: true });
    cache.del('schools:list');
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, [
  body('name').trim().notEmpty().isLength({ max: 200 }),
  handle,
], async (req, res) => {
  try {
    await School.updateOne({ id: req.params.id }, { $set: req.body }, { upsert: true });
    cache.del('schools:list');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/', auth, async (req, res) => {
  try {
    const list = req.body;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'Array expected' });
    const ops = list.map(s => ({ updateOne: { filter: { id: s.id }, update: { $set: s }, upsert: true } }));
    if (ops.length) await School.bulkWrite(ops, { ordered: false });
    const ids = list.map(s => s.id).filter(Boolean);
    if (ids.length) await School.deleteMany({ id: { $nin: ids } });
    cache.del('schools:list');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await School.deleteOne({ id: req.params.id });
    cache.del('schools:list');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
