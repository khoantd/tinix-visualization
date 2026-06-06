/** PostgreSQL schema for core + extended tables (Neon). */
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    config TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS user_templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    image TEXT,
    config TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS template_overrides (
    id TEXT PRIMARY KEY,
    config TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS system_templates (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    category INTEGER DEFAULT 8,
    image TEXT,
    config TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS system_settings (
    id TEXT PRIMARY KEY,
    config TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS private_photos (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    content TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS datasets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT DEFAULT 'json',
    content TEXT NOT NULL,
    bi_config TEXT,
    source_type TEXT DEFAULT 'upload',
    connector_id TEXT,
    sql_query TEXT,
    table_ref TEXT,
    refresh_policy TEXT DEFAULT 'manual',
    graphql_variables TEXT,
    graphql_root_field TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS db_connectors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    engine TEXT NOT NULL,
    config TEXT NOT NULL,
    status TEXT DEFAULT 'unknown',
    status_message TEXT,
    last_tested_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS embed_apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key_hash TEXT NOT NULL UNIQUE,
    allowed_origins TEXT DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS agent_apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key_hash TEXT NOT NULL UNIQUE,
    scopes TEXT NOT NULL DEFAULT '["catalog:read","data:read"]',
    allowed_resource_ids TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS agent_audit_log (
    id SERIAL PRIMARY KEY,
    app_id TEXT,
    principal TEXT,
    tool_or_route TEXT,
    resource_ids TEXT,
    row_count INTEGER,
    status TEXT,
    latency_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS agent_idempotency_keys (
    key TEXT PRIMARY KEY,
    response JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  )`,
];

module.exports = { SCHEMA_STATEMENTS };
