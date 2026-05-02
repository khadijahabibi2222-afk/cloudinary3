/**
 * seeds/seed.js — Database seeder
 * Run standalone : npm run seed
 * Imported by    : server.js (auto-seed when DB is empty)
 *
 * Idempotent: safe to run multiple times — only creates missing users.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User     = require('../models/User');
const logger   = require('../lib/logger');

const DEFAULT_USERS = [
  { username: 'admin',  password: 'admin123',  fullName: 'System Administrator', role: 'admin'  },
  { username: 'editor', password: 'edit123',   fullName: 'Data Editor',          role: 'editor' },
  { username: 'viewer', password: 'view123',   fullName: 'Read-Only Viewer',     role: 'viewer' },
];

/**
 * seedUsers — creates missing default users.
 * Can be called from server.js (connection already open)
 * or from the standalone CLI entry-point below.
 */
async function seedUsers() {
  let created = 0;
  for (const u of DEFAULT_USERS) {
    const exists = await User.findOne({ username: u.username });
    if (!exists) {
      await User.create(u);
      logger.info(`  ✚ Created user: ${u.username} (${u.role})`);
      created++;
    } else {
      logger.info(`  ✓ User already exists: ${u.username}`);
    }
  }
  logger.info(`✅ Seeding complete — ${created} user(s) created`);
  if (created > 0) {
    logger.warn('⚠️  Change default passwords immediately after first login!');
  }
  return created;
}

/**
 * Standalone CLI entry-point: node seeds/seed.js  /  npm run seed
 * Only runs when this file is executed directly, not when imported.
 */
if (require.main === module) {
  (async () => {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 8000,
      });
      logger.info('✅ Connected to MongoDB for seeding');
      await seedUsers();
    } catch (err) {
      logger.error('❌ Seeding failed', { err: err.message });
      process.exit(1);
    } finally {
      await mongoose.disconnect();
      logger.info('🔌 Disconnected from MongoDB');
    }
  })();
}

module.exports = { seedUsers };
