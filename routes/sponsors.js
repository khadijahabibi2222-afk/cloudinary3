const router   = require('express').Router();
const Sponsor  = require('../models/Sponsor');
const auth     = require('../middleware/auth');
const cache    = require('../lib/cache');
const logger   = require('../lib/logger');
const { body, query, handle, paginationRules, sponsorRules } = require('../middleware/validate');

const TTL = 60;

router.get('/', auth, paginationRules(), async (req, res) => {
  try {
    const page  = req.query.page  || 1;
    const limit = req.query.limit || 100;
    const cacheKey = `sponsors:list:${page}:${limit}`;
    const cached   = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const [data, total] = await Promise.all([
      Sponsor.find({}, { __v: 0 }).skip((page-1)*limit).limit(limit).lean(),
      Sponsor.countDocuments(),
    ]);
    const result = { data, pagination: { page, limit, total } };
    await cache.set(cacheKey, result, TTL);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const s = await Sponsor.findOne({ id: req.params.id }).lean();
    if (!s) return res.status(404).json({ error: 'Not found' });
    res.json(s);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', auth, [...sponsorRules(), handle], async (req, res) => {
  try {
    await Sponsor.updateOne({ id: req.body.id }, { $set: req.body }, { upsert: true });
    await cache.delPattern('sponsors*');
    logger.info('Sponsor saved', { id: req.body.id, user: req.user.username });
    res.status(201).json({ ok: true, id: req.body.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', auth, [...sponsorRules(), handle], async (req, res) => {
  try {
    await Sponsor.updateOne(
      { id: req.params.id },
      { $set: { ...req.body, updatedAt: new Date() } },
      { upsert: true }
    );
    await cache.delPattern('sponsors*');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/', auth, async (req, res) => {
  try {
    const list = req.body;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'Array expected' });
    const ops = list.map(s => ({
      updateOne: { filter: { id: s.id }, update: { $set: s }, upsert: true }
    }));
    if (ops.length) await Sponsor.bulkWrite(ops, { ordered: false });
    const ids = list.map(s => s.id).filter(Boolean);
    if (ids.length) await Sponsor.deleteMany({ id: { $nin: ids } });
    await cache.delPattern('sponsors*');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await Sponsor.deleteOne({ id: req.params.id });
    await cache.delPattern('sponsors*');
    logger.info('Sponsor deleted', { id: req.params.id, user: req.user.username });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
