const path = require('path');
const fs = require('fs');
const { Client: PgClient } = require('pg');
const mysql = require('mysql2/promise');
const Database = require('better-sqlite3');
const { validateEngine, getEngine } = require('./connector.config');
const { decryptPassword } = require('./connector.crypto');
const graphqlConnector = require('./graphql.connector');

const QUERY_TIMEOUT_MS = 30000;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

function resolveConfig(config, engine) {
  const parsed = typeof config === 'string' ? JSON.parse(config) : { ...config };
  if (engine === 'sqlite') {
    return parsed;
  }
  const password = parsed.password_enc ? decryptPassword(parsed.password_enc) : '';
  return { ...parsed, password };
}

function assertReadOnlyQuery(sql) {
  if (!sql || typeof sql !== 'string') {
    throw new Error('SQL query is required');
  }
  const trimmed = sql.trim();
  if (!trimmed) throw new Error('SQL query is empty');

  const normalized = trimmed.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ').trim();
  const upper = normalized.toUpperCase();

  if (normalized.includes(';')) {
    throw new Error('Only single-statement queries are allowed');
  }

  const forbidden = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
    'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'CALL', 'MERGE', 'REPLACE',
  ];
  for (const kw of forbidden) {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    if (re.test(normalized)) {
      throw new Error(`Forbidden keyword in query: ${kw}`);
    }
  }

  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    throw new Error('Only SELECT or WITH queries are allowed');
  }

  return normalized;
}

function applyLimit(sql, limit = DEFAULT_LIMIT) {
  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const upper = sql.toUpperCase();
  if (/\bLIMIT\b/.test(upper)) {
    return sql;
  }
  return `${sql} LIMIT ${safeLimit}`;
}

async function withTimeout(promise, ms = QUERY_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Query timed out')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function connectPostgres(config) {
  const client = new PgClient({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  return {
    kind: 'postgres',
    client,
    async close() {
      await client.end();
    },
  };
}

async function connectMysql(config) {
  const conn = await mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    connectTimeout: 10000,
  });
  return {
    kind: 'mysql',
    client: conn,
    async close() {
      await conn.end();
    },
  };
}

function connectSqlite(config) {
  const filePath = path.resolve(config.filePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`SQLite file not found: ${filePath}`);
  }
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  return {
    kind: 'sqlite',
    client: db,
    async close() {
      db.close();
    },
  };
}

async function openConnection(config, engine) {
  validateEngine(engine);
  const resolved = resolveConfig(config, engine);
  if (engine === 'postgres') return connectPostgres(resolved);
  if (engine === 'mysql') return connectMysql(resolved);
  if (engine === 'sqlite') return connectSqlite(resolved);
  throw new Error(`Unsupported engine: ${engine}`);
}

async function testConnection(config, engine) {
  if (engine === 'graphql') {
    return graphqlConnector.testConnection(config);
  }
  const conn = await openConnection(config, engine);
  try {
    if (engine === 'postgres') {
      await conn.client.query('SELECT 1');
    } else if (engine === 'mysql') {
      await conn.client.query('SELECT 1');
    } else {
      conn.client.prepare('SELECT 1').get();
    }
    return { ok: true, message: 'Connection successful' };
  } finally {
    await conn.close();
  }
}

async function listSchemas(config, engine) {
  if (engine === 'graphql') {
    return graphqlConnector.listSchemas(config);
  }
  const conn = await openConnection(config, engine);
  try {
    if (engine === 'postgres') {
      const res = await conn.client.query(`
        SELECT schema_name AS name
        FROM information_schema.schemata
        WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
        ORDER BY schema_name
      `);
      return res.rows.map(r => r.name);
    }
    if (engine === 'mysql') {
      const [rows] = await conn.client.query('SHOW DATABASES');
      return rows.map(r => r.Database);
    }
    return ['main'];
  } finally {
    await conn.close();
  }
}

async function listTables(config, engine, schema) {
  if (engine === 'graphql') {
    return graphqlConnector.listTables(config, schema);
  }
  const conn = await openConnection(config, engine);
  try {
    if (engine === 'postgres') {
      const res = await conn.client.query(
        `SELECT table_name AS name, table_type AS type
         FROM information_schema.tables
         WHERE table_schema = $1
         ORDER BY table_name`,
        [schema || 'public']
      );
      return res.rows.map(r => ({ name: r.name, type: r.type }));
    }
    if (engine === 'mysql') {
      const dbName = schema;
      const [rows] = await conn.client.query(
        `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
         FROM information_schema.tables
         WHERE table_schema = ?
         ORDER BY TABLE_NAME`,
        [dbName]
      );
      return rows.map(r => ({ name: r.name, type: r.type }));
    }
    const rows = conn.client.prepare(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') ORDER BY name"
    ).all();
    return rows.map(r => ({ name: r.name, type: r.type }));
  } finally {
    await conn.close();
  }
}

async function listColumns(config, engine, schema, table) {
  if (!table) throw new Error('table is required');
  if (engine === 'graphql') {
    return graphqlConnector.listColumns(config, schema, table);
  }
  const conn = await openConnection(config, engine);
  try {
    if (engine === 'postgres') {
      const res = await conn.client.query(
        `SELECT column_name AS name, data_type AS type, is_nullable AS nullable
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema || 'public', table]
      );
      return res.rows.map(r => ({
        name: r.name,
        type: r.type,
        nullable: r.nullable === 'YES',
      }));
    }
    if (engine === 'mysql') {
      const [rows] = await conn.client.query(
        `SELECT COLUMN_NAME AS name, DATA_TYPE AS type, IS_NULLABLE AS nullable
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?
         ORDER BY ORDINAL_POSITION`,
        [schema, table]
      );
      return rows.map(r => ({
        name: r.name,
        type: r.type,
        nullable: r.nullable === 'YES',
      }));
    }
    const rows = conn.client.prepare(`PRAGMA table_info(${quoteSqliteIdent(table)})`).all();
    return rows.map(r => ({
      name: r.name,
      type: r.type,
      nullable: r.notnull === 0,
    }));
  } finally {
    await conn.close();
  }
}

function quoteSqliteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function quoteIdent(name, engine) {
  if (engine === 'mysql') return `\`${String(name).replace(/`/g, '``')}\``;
  return `"${String(name).replace(/"/g, '""')}"`;
}

function buildTableSelect(engine, schema, table, limit = 100) {
  if (engine === 'postgres') {
    const s = quoteIdent(schema || 'public', engine);
    const t = quoteIdent(table, engine);
    return `SELECT * FROM ${s}.${t} LIMIT ${limit}`;
  }
  if (engine === 'mysql') {
    const s = quoteIdent(schema, engine);
    const t = quoteIdent(table, engine);
    return `SELECT * FROM ${s}.${t} LIMIT ${limit}`;
  }
  const t = quoteSqliteIdent(table);
  return `SELECT * FROM ${t} LIMIT ${limit}`;
}

function rowsToObjects(rows, fields) {
  if (!Array.isArray(rows)) return [];
  if (rows.length === 0) return [];
  if (typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
    return rows.map(row => normalizeRow(row));
  }
  return rows.map(row => {
    const obj = {};
    fields.forEach((f, i) => {
      obj[f.name] = row[i];
    });
    return normalizeRow(obj);
  });
}

function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (Buffer.isBuffer(v)) {
      out[k] = v.toString('base64');
    } else if (typeof v === 'bigint') {
      out[k] = v.toString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function runReadOnlyQuery(config, engine, sql, limit = DEFAULT_LIMIT, options = {}) {
  if (engine === 'graphql') {
    const query = options.query || sql;
    return graphqlConnector.runGraphQLQuery(
      config,
      query,
      options.variables || {},
      limit,
      options.rootField || null
    );
  }
  const safeSql = assertReadOnlyQuery(sql);
  const limitedSql = applyLimit(safeSql, limit);
  const conn = await openConnection(config, engine);
  const start = Date.now();

  try {
    if (engine === 'postgres') {
      const res = await withTimeout(conn.client.query(limitedSql));
      return {
        rows: rowsToObjects(res.rows),
        rowCount: res.rowCount,
        durationMs: Date.now() - start,
        sql: limitedSql,
      };
    }
    if (engine === 'mysql') {
      const [rows, fields] = await withTimeout(conn.client.query(limitedSql));
      return {
        rows: rowsToObjects(rows, fields),
        rowCount: Array.isArray(rows) ? rows.length : 0,
        durationMs: Date.now() - start,
        sql: limitedSql,
      };
    }
    const rows = conn.client.prepare(limitedSql).all();
    return {
      rows: rowsToObjects(rows),
      rowCount: rows.length,
      durationMs: Date.now() - start,
      sql: limitedSql,
    };
  } finally {
    await conn.close();
  }
}

function formatConnectorRow(row) {
  const config = JSON.parse(row.config);
  const { stripSecrets } = require('./connector.crypto');
  const { getConnectionSummary } = require('./connector.config');
  return {
    id: row.id,
    name: row.name,
    engine: row.engine,
    config: stripSecrets(config),
    connectionSummary: getConnectionSummary(config, row.engine),
    status: row.status || 'unknown',
    statusMessage: row.status_message || null,
    lastTestedAt: row.last_tested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  testConnection,
  listSchemas,
  listTables,
  listColumns,
  runReadOnlyQuery,
  buildTableSelect,
  formatConnectorRow,
  assertReadOnlyQuery,
  getEngine,
};
