/**
 * cache.js — Two-tier cache layer
 *
 * Tier 1: NodeCache (in-memory, zero dependencies, works everywhere)
 * Tier 2: Redis    (optional — set REDIS_URL env var to enable)
 *
 * Usage:
 *   const cache = require('./lib/cache');
 *   await cache.get('orphans')          → value | null
 *   await cache.set('orphans', data)    → void
 *   await cache.del('orphans')          → void
 *   await cache.delPattern('orphan*')   → void  (clears all matching keys)
 */

const NodeCache = require('node-cache');

// ── In-memory cache (always active) ──────────────────────────
const mem = new NodeCache({
  stdTTL:       60,    // 60 second default TTL
  checkperiod:  120,   // sweep every 2 min
  useClones:    false, // don't clone objects (faster, less RAM)
  deleteOnExpire: true,
});

// ── Redis client (optional) ───────────────────────────────────
let redis = null;
const REDIS_TTL = 60; // seconds

if (process.env.REDIS_URL) {
  try {
    const IORedis = require('ioredis');
    redis = new IORedis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redis.connect().then(() => {
      console.log('✅ Redis connected');
    }).catch(err => {
      console.warn('⚠️  Redis unavailable, using in-memory cache:', err.message);
      redis = null;
    });
  } catch {
    console.warn('⚠️  ioredis not installed — using in-memory cache only');
    redis = null;
  }
}

// ── Public API ────────────────────────────────────────────────
async function get(key) {
  // Try memory first (fastest)
  const hit = mem.get(key);
  if (hit !== undefined) return hit;

  // Try Redis
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (raw) {
        const val = JSON.parse(raw);
        mem.set(key, val); // warm memory tier
        return val;
      }
    } catch { /* Redis error — fall through */ }
  }
  return null;
}

async function set(key, value, ttl = REDIS_TTL) {
  mem.set(key, value, ttl);
  if (redis) {
    try {
      await redis.setex(key, ttl, JSON.stringify(value));
    } catch { /* non-fatal */ }
  }
}

async function del(key) {
  mem.del(key);
  if (redis) {
    try { await redis.del(key); } catch { }
  }
}

// Clears all keys matching prefix (e.g. 'orphan*')
async function delPattern(pattern) {
  // Memory: iterate all keys
  const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
  mem.keys().filter(k => regex.test(k)).forEach(k => mem.del(k));

  // Redis SCAN (non-blocking)
  if (redis) {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length) await redis.del(...keys);
      } while (cursor !== '0');
    } catch { }
  }
}

function stats() {
  return {
    keys: mem.keys().length,
    hits: mem.getStats().hits,
    misses: mem.getStats().misses,
    redis: !!redis,
  };
}

module.exports = { get, set, del, delPattern, stats };
