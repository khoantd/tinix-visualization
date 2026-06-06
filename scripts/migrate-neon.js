#!/usr/bin/env node
/**
 * Apply PostgreSQL schema to Neon (or any DATABASE_URL).
 *
 * Usage:
 *   npm install --prefix server
 *   DATABASE_URL="postgresql://..." npm run migrate:neon
 */
const path = require('path');
const { Pool } = require(path.join(__dirname, '../server/node_modules/pg'));
const { SCHEMA_STATEMENTS } = require('../server/db/schema.postgres');

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error('Set DATABASE_URL (Neon connection string) before running this script.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: url,
  ssl: url.includes('sslmode=require') || url.includes('neon.tech')
    ? { rejectUnauthorized: false }
    : undefined,
});

async function main() {
  try {
    for (const statement of SCHEMA_STATEMENTS) {
      await pool.query(statement);
      console.log('OK:', statement.split('\n')[0].trim());
    }
    console.log('Schema migration complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
