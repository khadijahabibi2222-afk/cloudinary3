/**
 * routes/orphans.js
 *
 * GET    /api/orphans           — paginated list (cached, no photos)
 * GET    /api/orphans/search    — full-text search
 * GET    /api/orphans/report/stats — lightweight stats (cached)
 * GET    /api/orphans/:id       — single record with full photo URL
 * POST   /api/orphans           — create single (validates + Cloudinary upload)
 * POST   /api/orphans/bulk      — insertMany for bulk import
 * PUT    /api/orphans/:id       — update single
 * DELETE /api/orphans/:id       — hard delete + Cloudinary cleanup
 * PUT    /api/orphans           — legacy bulk replace
 */

const router    = require('express').Router();
const Orphan    = require('../models/Orphan');
const auth      = require('../middleware/auth');
const cache     = require('../lib/cache');
const logger    = require('../lib/logger');
const cdn       = require('../lib/cloudinary');
const { body, query, param, handle, paginationRules, orphanRules } = require('../middleware/validate');

const LIST_TTL  = 30;   // seconds
const STATS_TTL = 60;

// ════════════════════════════════════════════════════════════
// GET /  — paginated, cached, no photo blobs
// ?page=1&limit=50&active=true&status=Healthy&studenttype=orphan&school=id&q=name
// ════════════════════════════════════════════════════════════
router.get('/', auth, [
  ...paginationRules(),
  query('active').optional().isIn(['true','false','all']),
  query('status').optional().isIn(['Healthy','Disabled','Chronic','']),
  query('studenttype').optional().isIn(['orphan','needy','']),
  handle,
], async (req, res) => {
  try {
    const page   = req.query.page  || 1;
    const limit  = req.query.limit || 100;
    const skip   = (page - 1) * limit;

    // Build filter from query params
    const filter = _buildFilter(req.query);

    // Cache key includes filter + page
    const cacheKey = `orphans:list:${JSON.stringify(filter)}:${page}:${limit}`;
    const cached   = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    // Parallel: data + total count (one round-trip each, both use indexes)
    const [docs, total] = await Promise.all([
      Orphan.find(filter, Orphan.PROJ.LIST).skip(skip).limit(limit).lean(),
      Orphan.countDocuments(filter),
    ]);

    const result = {
      data:       docs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };

    await cache.set(cacheKey, result, LIST_TTL);
    res.json(result);
  } catch (err) {
    logger.error('GET /orphans error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /search?q=text&page=1&limit=20
// ════════════════════════════════════════════════════════════
router.get('/search', auth, [
  query('q').trim().notEmpty().withMessage('q الزامی است'),
  ...paginationRules(),
  handle,
], async (req, res) => {
  try {
    const q     = req.query.q.trim();
    const limit = req.query.limit || 50;
    const page  = req.query.page  || 1;

    const [docs, total] = await Promise.all([
      Orphan.find(
        { $text: { $search: q } },
        { ...Orphan.PROJ.TABLE, score: { $meta: 'textScore' } }
      ).sort({ score: { $meta: 'textScore' } })
       .skip((page - 1) * limit).limit(limit).lean(),
      Orphan.countDocuments({ $text: { $search: q } }),
    ]);

    res.json({ data: docs, pagination: { page, limit, total } });
  } catch (err) {
    logger.error('GET /orphans/search error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /report/stats — cached lightweight aggregation
// ════════════════════════════════════════════════════════════
router.get('/report/stats', auth, async (req, res) => {
  try {
    const cached = await cache.get('orphans:stats');
    if (cached) return res.json(cached);

    const data  = await Orphan.find({}, Orphan.PROJ.STATS).lean();
    const stats = {
      total:      data.length,
      active:     data.filter(o => o.isActive !== false).length,
      inactive:   data.filter(o => o.isActive === false).length,
      healthy:    data.filter(o => o.status === 'Healthy').length,
      disabled:   data.filter(o => o.status === 'Disabled').length,
      chronic:    data.filter(o => o.status === 'Chronic').length,
      orphan:     data.filter(o => (o.studenttype||'orphan') === 'orphan').length,
      needy:      data.filter(o => o.studenttype === 'needy').length,
      inSchool:   data.filter(o => o.goesSchool && o.school).length,
      veryWorthy: data.filter(o => o.priority === 'very_worthy').length,
    };
    await cache.set('orphans:stats', stats, STATS_TTL);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// GET /:id — single with full photo URL
// ════════════════════════════════════════════════════════════
router.get('/:id', auth, async (req, res) => {
  try {
    const cacheKey = 'orphan:' + req.params.id;
    const cached   = await cache.get(cacheKey);
    if (cached) return res.json(cached);

    const o = await Orphan.findOne({ id: req.params.id }).select('+photoFull').lean();
    if (!o) return res.status(404).json({ error: 'Not found' });

    // Merge photoFull back into photo object
    if (o.photoFull) {
      o.photo = { ...(typeof o.photo === 'object' ? o.photo : {}), full: o.photoFull };
      delete o.photoFull;
    }

    await cache.set(cacheKey, o, LIST_TTL);
    res.json(o);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// POST / — create single with validation + Cloudinary upload
// ════════════════════════════════════════════════════════════
router.post('/', auth, [...orphanRules(), handle], async (req, res) => {
  try {
    const doc = await _processPhoto(req.body, req.body.id);

    await Orphan.updateOne(
      { id: doc.id },
      { $set: { ...doc, updatedAt: new Date() } },
      { upsert: true }
    );

    await cache.delPattern('orphans:list*');
    cache.del('orphan:' + doc.id);
    cache.del('orphans:stats');

    logger.info('Orphan saved', { id: doc.id, user: req.user.username });
    res.status(201).json({ ok: true, id: doc.id });
  } catch (err) {
    logger.error('POST /orphans error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// POST /bulk — insertMany for fast bulk import
// Body: array of orphan objects (max 500 per request)
// ════════════════════════════════════════════════════════════
router.post('/bulk', auth, [
  body().isArray({ min: 1, max: 500 }).withMessage('Array of 1–500 items required'),
  body('*.id').notEmpty().withMessage('Each item must have an id'),
  body('*.name').notEmpty().withMessage('Each item must have a name'),
  handle,
], async (req, res) => {
  try {
    const list = req.body;

    // Build bulk ops — upsert by id (safe to re-run)
    const ops = list.map(o => ({
      updateOne: {
        filter: { id: o.id },
        update: { $set: { ..._splitPhoto(o), updatedAt: new Date() } },
        upsert: true,
      },
    }));

    const result = await Orphan.bulkWrite(ops, { ordered: false });

    await cache.delPattern('orphans*');

    logger.info('Bulk import', {
      total: list.length,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
      user: req.user.username,
    });

    res.json({
      ok: true,
      total:    list.length,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
    });
  } catch (err) {
    logger.error('POST /orphans/bulk error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PUT /:id — update single with validation
// ════════════════════════════════════════════════════════════
router.put('/:id', auth, [...orphanRules(), handle], async (req, res) => {
  try {
    const doc = await _processPhoto(req.body, req.params.id);

    await Orphan.updateOne(
      { id: req.params.id },
      { $set: { ...doc, updatedAt: new Date() } },
      { upsert: true }
    );

    await cache.delPattern('orphans:list*');
    cache.del('orphan:' + req.params.id);
    cache.del('orphans:stats');

    logger.info('Orphan updated', { id: req.params.id, user: req.user.username });
    res.json({ ok: true });
  } catch (err) {
    logger.error('PUT /orphans/:id error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// DELETE /:id — hard delete + Cloudinary cleanup
// ════════════════════════════════════════════════════════════
router.delete('/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;

    // Get photo publicId before deleting (for Cloudinary cleanup)
    const existing = await Orphan.findOne({ id }, { photo: 1 }).lean();
    if (existing?.photo?.publicId) {
      await cdn.deletePhoto(existing.photo.publicId);
    }

    await Orphan.deleteOne({ id });

    await cache.delPattern('orphans:list*');
    cache.del('orphan:' + id);
    cache.del('orphans:stats');

    logger.info('Orphan deleted', { id, user: req.user.username });
    res.json({ ok: true });
  } catch (err) {
    logger.error('DELETE /orphans/:id error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// PUT / — legacy bulk replace (kept for backward compatibility)
// ════════════════════════════════════════════════════════════
router.put('/', auth, async (req, res) => {
  try {
    const list = req.body;
    if (!Array.isArray(list)) return res.status(400).json({ error: 'Array expected' });
    if (list.length > 1000)   return res.status(400).json({ error: 'Max 1000 items per request. Use /bulk for imports.' });

    const ops = list.map(o => ({
      updateOne: {
        filter: { id: o.id },
        update: { $set: { ..._splitPhoto(o), updatedAt: new Date() } },
        upsert: true,
      },
    }));
    if (ops.length) await Orphan.bulkWrite(ops, { ordered: false });

    const ids = list.map(o => o.id).filter(Boolean);
    if (ids.length) await Orphan.deleteMany({ id: { $nin: ids } });

    await cache.delPattern('orphans*');
    res.json({ ok: true, count: list.length });
  } catch (err) {
    logger.error('PUT /orphans (bulk) error', { err: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════

/** Build MongoDB filter from query params */
function _buildFilter(q) {
  const f = {};
  if (q.active === 'true')  f.isActive = true;
  if (q.active === 'false') f.isActive = false;
  if (q.status)      f.status      = q.status;
  if (q.studenttype) f.studenttype = q.studenttype;
  if (q.school)      f.school      = q.school;
  if (q.grade)       f.grade       = q.grade;
  if (q.priority)    f.priority    = q.priority;
  if (q.edutype)     f.edutype     = q.edutype;
  return f;
}

/**
 * Process photo before saving:
 * 1. If Cloudinary configured → upload base64, store URL + publicId
 * 2. If not configured → split full/thumb (old behavior)
 */
async function _processPhoto(doc, orphanId) {
  const d = { ...doc };
  const photoData = d.photo;

  // Case 1: photo is a base64 data URI → upload to Cloudinary
  if (typeof photoData === 'string' && photoData.startsWith('data:')) {
    const uploaded = await cdn.uploadPhoto(photoData, orphanId);
    if (uploaded) {
      d.photo = {
        url:      uploaded.url,
        thumb:    cdn.thumbUrl(uploaded.url, 120),
        publicId: uploaded.publicId,
        source:   'cloudinary',
      };
      delete d.photoFull;
      return d;
    }
  }

  // Case 2: photo is an object with .full (from IndexedDB) → upload if possible
  if (photoData && typeof photoData === 'object' && photoData.full?.startsWith('data:')) {
    const uploaded = await cdn.uploadPhoto(photoData.full, orphanId);
    if (uploaded) {
      d.photo = {
        url:      uploaded.url,
        thumb:    cdn.thumbUrl(uploaded.url, 120),
        publicId: uploaded.publicId,
        source:   'cloudinary',
      };
      delete d.photoFull;
      return d;
    }
  }

  // Fallback: split for DB storage (Cloudinary not configured)
  return _splitPhoto(d);
}

/** Separate full base64 photo into photoFull field (excluded from list queries) */
function _splitPhoto(doc) {
  const d = { ...doc };
  if (d.photo && typeof d.photo === 'object' && d.photo.full) {
    d.photoFull = d.photo.full;
    d.photo     = { thumb: d.photo.thumb || null, hasFullInDB: true };
  } else if (typeof d.photo === 'string' && d.photo.length > 5000) {
    d.photoFull = d.photo;
    d.photo     = { hasFullInDB: true };
  }
  return d;
}

module.exports = router;
