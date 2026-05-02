/**
 * writeQueue.js — REMOVED / REPLACED
 *
 * WriteQueue was removed because:
 *   - Silent failures: DB errors were swallowed and never surfaced to user
 *   - Race conditions: rapid edits could result in stale writes landing last
 *   - Hard to debug: no way to know if a record actually saved
 *
 * Replacement strategy (in routes):
 *   - Single-record writes use direct await (fast: <20ms on indexed field)
 *   - Routes respond after the write confirms — reliable by default
 *   - Proper try/catch in every route handler
 *
 * This file is kept as a stub so existing require() calls don't crash.
 * All routes have been updated to NOT use this queue.
 */

module.exports = {
  push:   (key, fn) => fn().catch(err => console.error('[WriteQueue stub]', key, err.message)),
  status: ()        => ({ pending: 0, busy: false, errors: 0, note: 'DEPRECATED' }),
};
