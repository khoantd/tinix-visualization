/**
 * Async data access layer — Neon Postgres when DATABASE_URL is set,
 * otherwise SQLite (better-sqlite3) for local legacy dev.
 */
const postgres = require('./postgres');

function usePostgres() {
  return Boolean(postgres.getDatabaseUrl());
}

async function queryAll(sql, args = []) {
  if (usePostgres()) {
    return postgres.queryAll(sql, args);
  }
  const sqlite = require('../db');
  return sqlite.prepare(sql).all(...args);
}

async function queryOne(sql, args = []) {
  if (usePostgres()) {
    return postgres.queryOne(sql, args);
  }
  const sqlite = require('../db');
  const row = sqlite.prepare(sql).get(...args);
  return row || null;
}

async function execute(sql, args = []) {
  if (usePostgres()) {
    return postgres.execute(sql, args);
  }
  const sqlite = require('../db');
  const result = sqlite.prepare(sql).run(...args);
  return { changes: result.changes, rowCount: result.changes };
}

async function withTransaction(fn) {
  if (usePostgres()) {
    return postgres.withTransaction(fn);
  }
  const sqlite = require('../db');
  const tx = {
    queryAll: async (sql, args = []) => sqlite.prepare(sql).all(...args),
    execute: async (sql, args = []) => {
      const result = sqlite.prepare(sql).run(...args);
      return { changes: result.changes, rowCount: result.changes };
    },
  };
  const run = sqlite.transaction(() => fn(tx));
  await run();
}

module.exports = {
  getDatabaseUrl: postgres.getDatabaseUrl,
  ensureSchema: postgres.ensureSchema,
  initSchema: postgres.initSchema,
  queryAll,
  queryOne,
  execute,
  withTransaction,
  usePostgres,
};
