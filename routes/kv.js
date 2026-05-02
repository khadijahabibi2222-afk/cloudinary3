const router  = require('express').Router();
const KVStore = require('../models/KVStore');
const auth    = require('../middleware/auth');
const cache   = require('../lib/cache');

router.get('/:key', auth, async (req, res) => {
  try {
    const cacheKey = 'kv:' + req.params.key;
    const cached   = await cache.get(cacheKey);
    if (cached !== null) return res.json(cached);

    const doc = await KVStore.findOne({ key: req.params.key }).lean();
    const data = doc ? doc.data : [];
    await cache.set(cacheKey, data, 120);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:key', auth, async (req, res) => {
  try {
    const { key } = req.params;
    await KVStore.updateOne(
      { key },
      { $set: { key, data: req.body } },
      { upsert: true }
    );
    cache.del('kv:' + key);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
