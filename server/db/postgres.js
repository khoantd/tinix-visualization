const { Pool } = require('pg');
const { SCHEMA_STATEMENTS } = require('./schema.postgres');

let pool = null;
let schemaReady = null;

function getDatabaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || null;
}

function getPool() {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error(
      'DATABASE_URL is required in core mode. Set your Neon connection string in .env or Vercel env vars.'
    );
  }
  if (!pool) {
    pool = new Pool({
      connectionString: url,
      ssl: url.includes('sslmode=require') || url.includes('neon.tech')
        ? { rejectUnauthorized: false }
        : undefined,
      max: process.env.VERCEL ? 1 : 10,
    });
  }
  return pool;
}

function toPgParams(sql, args = []) {
  let index = 0;
  const pgSql = sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
  return { pgSql, args };
}

async function queryAll(sql, args = []) {
  const { pgSql, args: params } = toPgParams(sql, args);
  const result = await getPool().query(pgSql, params);
  return result.rows;
}

async function queryOne(sql, args = []) {
  const rows = await queryAll(sql, args);
  return rows[0] || null;
}

async function execute(sql, args = []) {
  const { pgSql, args: params } = toPgParams(sql, args);
  const result = await getPool().query(pgSql, params);
  return { changes: result.rowCount, rowCount: result.rowCount };
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const tx = {
      queryAll: async (sql, args = []) => {
        const { pgSql, args: params } = toPgParams(sql, args);
        const result = await client.query(pgSql, params);
        return result.rows;
      },
      execute: async (sql, args = []) => {
        const { pgSql, args: params } = toPgParams(sql, args);
        const result = await client.query(pgSql, params);
        return { changes: result.rowCount, rowCount: result.rowCount };
      },
    };
    await fn(tx);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function initSchema() {
  for (const statement of SCHEMA_STATEMENTS) {
    await getPool().query(statement);
  }
}

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = initSchema().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

module.exports = {
  getDatabaseUrl,
  queryAll,
  queryOne,
  execute,
  withTransaction,
  initSchema,
  ensureSchema,
};
