const crypto = require('crypto');
const db = require('./db/index');

const TOKEN_TTL_SECONDS = parseInt(process.env.AGENT_TOKEN_TTL_SECONDS || process.env.EMBED_TOKEN_TTL_SECONDS || '300', 10);

const ALL_SCOPES = [
  'catalog:read',
  'data:read',
  'auto_bi',
  'dashboard:write',
  'dashboard:publish',
  'embed:mint',
];

const DEFAULT_SCOPES = ['catalog:read', 'data:read'];

function getAgentSecret() {
  const secret = process.env.AGENT_JWT_SECRET || process.env.EMBED_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'AGENT_JWT_SECRET or EMBED_JWT_SECRET is not configured or too short (min 32 chars). Add it to .env.'
    );
  }
  return secret;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signAgentToken(payload, ttlSeconds = TOKEN_TTL_SECONDS) {
  const secret = getAgentSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, typ: 'agent', iat: now, exp: now + ttlSeconds };
  const segments = [base64url(JSON.stringify(header)), base64url(JSON.stringify(body))];
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${segments[0]}.${segments[1]}`)
    .digest('base64url');
  return `${segments[0]}.${segments[1]}.${signature}`;
}

function verifyAgentToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Agent token is required');
  }
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid agent token format');

  const secret = getAgentSecret();
  const [headerB64, payloadB64, signature] = parts;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signature !== expected) throw new Error('Invalid agent token signature');

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw new Error('Agent token expired');
  if (payload.typ !== 'agent') throw new Error('Invalid token type');

  return payload;
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function generateApiKey() {
  return `tag_${crypto.randomBytes(24).toString('hex')}`;
}

function generateAppId() {
  return `agent_${crypto.randomBytes(8).toString('hex')}`;
}

function parseJsonArray(value, fallback = []) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseAllowedResources(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatAgentApp(row) {
  return {
    id: row.id,
    name: row.name,
    scopes: parseJsonArray(row.scopes, DEFAULT_SCOPES),
    allowedResourceIds: parseAllowedResources(row.allowed_resource_ids),
    createdAt: row.created_at,
  };
}

async function getAgentAppById(id) {
  const row = await db.queryOne('SELECT * FROM agent_apps WHERE id = ?', [id]);
  if (!row) return null;
  return formatAgentApp(row);
}

async function getAgentAppByApiKey(apiKey) {
  const hash = hashApiKey(apiKey);
  const row = await db.queryOne('SELECT * FROM agent_apps WHERE api_key_hash = ?', [hash]);
  if (!row) return null;
  return formatAgentApp(row);
}

async function listAgentApps() {
  const rows = await db.queryAll('SELECT * FROM agent_apps ORDER BY created_at DESC');
  return rows.map(formatAgentApp);
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) return [...DEFAULT_SCOPES];
  return scopes.filter((s) => ALL_SCOPES.includes(s));
}

async function createAgentApp({ name, scopes = DEFAULT_SCOPES, allowedResourceIds = null }) {
  if (!name || !String(name).trim()) throw new Error('name is required');
  const id = generateAppId();
  const apiKey = generateApiKey();
  const normalizedScopes = normalizeScopes(scopes);

  await db.execute(
    `INSERT INTO agent_apps (id, name, api_key_hash, scopes, allowed_resource_ids, created_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      id,
      String(name).trim(),
      hashApiKey(apiKey),
      JSON.stringify(normalizedScopes),
      allowedResourceIds ? JSON.stringify(allowedResourceIds) : null,
    ]
  );

  return {
    id,
    name: String(name).trim(),
    apiKey,
    scopes: normalizedScopes,
    allowedResourceIds: allowedResourceIds || null,
  };
}

async function updateAgentAppScopes(appId, scopes, allowedResourceIds) {
  const app = await getAgentAppById(appId);
  if (!app) throw new Error('Agent app not found');
  const normalizedScopes = normalizeScopes(scopes);
  await db.execute('UPDATE agent_apps SET scopes = ?, allowed_resource_ids = ? WHERE id = ?', [
    JSON.stringify(normalizedScopes),
    allowedResourceIds ? JSON.stringify(allowedResourceIds) : null,
    appId,
  ]);
  return {
    id: appId,
    scopes: normalizedScopes,
    allowedResourceIds: allowedResourceIds || null,
  };
}

async function rotateAgentAppKey(appId) {
  const app = await getAgentAppById(appId);
  if (!app) throw new Error('Agent app not found');
  const apiKey = generateApiKey();
  await db.execute('UPDATE agent_apps SET api_key_hash = ? WHERE id = ?', [hashApiKey(apiKey), appId]);
  return { id: appId, apiKey };
}

async function deleteAgentApp(appId) {
  const app = await getAgentAppById(appId);
  if (!app) throw new Error('Agent app not found');
  await db.execute('DELETE FROM agent_apps WHERE id = ?', [appId]);
  return { success: true, id: appId };
}

function mintAgentToken({ app, user, requestedScopes }) {
  const appScopes = app.scopes || DEFAULT_SCOPES;
  let scopes = requestedScopes && requestedScopes.length
    ? requestedScopes.filter((s) => appScopes.includes(s))
    : [...appScopes];

  if (scopes.length === 0) scopes = [...appScopes];

  const userId = user?.id || user?.userId || 'agent';
  const email = user?.email || null;

  const token = signAgentToken({
    sub: String(userId),
    email,
    appId: app.id,
    scopes,
    allowedResourceIds: app.allowedResourceIds || null,
  });

  return {
    token,
    expiresIn: TOKEN_TTL_SECONDS,
    scopes,
    appId: app.id,
  };
}

function assertScope(tokenPayload, requiredScope) {
  const scopes = tokenPayload.scopes || [];
  if (!scopes.includes(requiredScope)) {
    const err = new Error(`Missing required scope: ${requiredScope}`);
    err.code = 'SCOPE_DENIED';
    throw err;
  }
}

function assertResourceAllowed(tokenPayload, resourceType, resourceId) {
  const allowed = tokenPayload.allowedResourceIds;
  if (!allowed) return;
  const list = allowed[resourceType];
  if (!list || !Array.isArray(list) || list.length === 0) return;
  if (!list.includes(String(resourceId))) {
    const err = new Error(`Access denied to ${resourceType} ${resourceId}`);
    err.code = 'RESOURCE_DENIED';
    throw err;
  }
}

async function writeAuditLog({
  appId,
  principal,
  toolOrRoute,
  resourceIds,
  rowCount,
  status,
  latencyMs,
}) {
  await db.execute(
    `INSERT INTO agent_audit_log (app_id, principal, tool_or_route, resource_ids, row_count, status, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      appId || null,
      principal || null,
      toolOrRoute || null,
      resourceIds ? JSON.stringify(resourceIds) : null,
      rowCount ?? null,
      status || 'ok',
      latencyMs ?? null,
    ]
  );
}

async function listAuditLogs({ limit = 50, offset = 0, appId } = {}) {
  const cappedLimit = Math.min(Math.max(1, limit), 200);
  const cappedOffset = Math.max(0, offset);

  let rows;
  if (appId) {
    rows = await db.queryAll(
      'SELECT * FROM agent_audit_log WHERE app_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [appId, cappedLimit, cappedOffset]
    );
  } else {
    rows = await db.queryAll(
      'SELECT * FROM agent_audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?',
      [cappedLimit, cappedOffset]
    );
  }

  return rows.map((row) => ({
    id: row.id,
    appId: row.app_id,
    principal: row.principal,
    toolOrRoute: row.tool_or_route,
    resourceIds: row.resource_ids ? JSON.parse(row.resource_ids) : null,
    rowCount: row.row_count,
    status: row.status,
    latencyMs: row.latency_ms,
    createdAt: row.created_at,
  }));
}

function parseBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function agentError(code, message, field) {
  return { error_code: code, message, field: field || undefined };
}

module.exports = {
  TOKEN_TTL_SECONDS,
  ALL_SCOPES,
  DEFAULT_SCOPES,
  signAgentToken,
  verifyAgentToken,
  createAgentApp,
  listAgentApps,
  updateAgentAppScopes,
  rotateAgentAppKey,
  deleteAgentApp,
  getAgentAppByApiKey,
  getAgentAppById,
  mintAgentToken,
  assertScope,
  assertResourceAllowed,
  writeAuditLog,
  listAuditLogs,
  parseBearerToken,
  agentError,
};
