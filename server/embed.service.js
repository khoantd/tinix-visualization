const crypto = require('crypto');
const db = require('./db');

const TOKEN_TTL_SECONDS = parseInt(process.env.EMBED_TOKEN_TTL_SECONDS || '300', 10);

function getEmbedSecret() {
  const secret = process.env.EMBED_JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      'EMBED_JWT_SECRET is not configured or too short (min 32 chars). Add it to .env.'
    );
  }
  return secret;
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signEmbedToken(payload, ttlSeconds = TOKEN_TTL_SECONDS) {
  const secret = getEmbedSecret();
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const segments = [base64url(JSON.stringify(header)), base64url(JSON.stringify(body))];
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${segments[0]}.${segments[1]}`)
    .digest('base64url');
  return `${segments[0]}.${segments[1]}.${signature}`;
}

function verifyEmbedToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('Embed token is required');
  }
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid embed token format');

  const secret = getEmbedSecret();
  const [headerB64, payloadB64, signature] = parts;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signature !== expected) throw new Error('Invalid embed token signature');

  const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) throw new Error('Embed token expired');

  return payload;
}

function hashApiKey(apiKey) {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function generateApiKey() {
  return `tex_${crypto.randomBytes(24).toString('hex')}`;
}

function generateAppId() {
  return `app_${crypto.randomBytes(8).toString('hex')}`;
}

function getEmbedAppById(id) {
  const row = db.prepare('SELECT * FROM embed_apps WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    allowed_origins: row.allowed_origins ? JSON.parse(row.allowed_origins) : [],
  };
}

function getEmbedAppByApiKey(apiKey) {
  const hash = hashApiKey(apiKey);
  const row = db.prepare('SELECT * FROM embed_apps WHERE api_key_hash = ?').get(hash);
  if (!row) return null;
  return {
    ...row,
    allowed_origins: row.allowed_origins ? JSON.parse(row.allowed_origins) : [],
  };
}

function listEmbedApps() {
  const rows = db.prepare('SELECT id, name, allowed_origins, created_at FROM embed_apps ORDER BY created_at DESC').all();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    allowedOrigins: row.allowed_origins ? JSON.parse(row.allowed_origins) : [],
    createdAt: row.created_at,
  }));
}

function createEmbedApp({ name, allowedOrigins = [] }) {
  if (!name || !String(name).trim()) throw new Error('name is required');
  const id = generateAppId();
  const apiKey = generateApiKey();
  const origins = Array.isArray(allowedOrigins) ? allowedOrigins : [];

  db.prepare(`
    INSERT INTO embed_apps (id, name, api_key_hash, allowed_origins, created_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(id, String(name).trim(), hashApiKey(apiKey), JSON.stringify(origins));

  return { id, name: String(name).trim(), apiKey, allowedOrigins: origins };
}

function rotateEmbedAppKey(appId) {
  const app = getEmbedAppById(appId);
  if (!app) throw new Error('Embed app not found');
  const apiKey = generateApiKey();
  db.prepare('UPDATE embed_apps SET api_key_hash = ? WHERE id = ?').run(hashApiKey(apiKey), appId);
  return { id: appId, apiKey };
}

function updateEmbedAppOrigins(appId, allowedOrigins) {
  const app = getEmbedAppById(appId);
  if (!app) throw new Error('Embed app not found');
  const origins = Array.isArray(allowedOrigins) ? allowedOrigins : [];
  db.prepare('UPDATE embed_apps SET allowed_origins = ? WHERE id = ?').run(JSON.stringify(origins), appId);
  return { id: appId, allowedOrigins: origins };
}

function getProjectConfig(projectId) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  if (!project) return null;
  const config = JSON.parse(project.config);
  return { id: project.id, config, updatedAt: project.updated_at };
}

function extractDashboardScope(config) {
  const datasetIds = new Set();
  const connectorIds = new Set();

  const addDatasetFromUrl = (url) => {
    if (!url || typeof url !== 'string') return;
    const match = url.match(/\/datasets\/([^/?#]+)/);
    if (match) datasetIds.add(match[1]);
  };

  const ponds = config.requestGlobalConfig?.requestDataPond || [];
  for (const pond of ponds) {
    addDatasetFromUrl(pond.dataPondRequestConfig?.requestUrl);
  }

  const components = config.componentList || [];
  for (const comp of components) {
    addDatasetFromUrl(comp.request?.requestUrl);
    const pondId = comp.request?.requestDataPondId;
    if (pondId) {
      const pond = ponds.find((p) => p.dataPondId === pondId);
      if (pond) addDatasetFromUrl(pond.dataPondRequestConfig?.requestUrl);
    }
    const connectorUrl = comp.request?.requestUrl || '';
    const connectorMatch = connectorUrl.match(/\/connectors\/([^/?#]+)\/query/);
    if (connectorMatch) connectorIds.add(connectorMatch[1]);
  }

  for (const dsId of datasetIds) {
    const row = db.prepare('SELECT connector_id FROM datasets WHERE id = ?').get(dsId);
    if (row?.connector_id) connectorIds.add(row.connector_id);
  }

  return {
    datasetIds: [...datasetIds],
    connectorIds: [...connectorIds],
  };
}

function isOriginAllowed(app, origin) {
  const origins = app.allowed_origins || [];
  if (!origins.length) return true;
  if (!origin) return false;
  return origins.some((allowed) => {
    if (allowed === '*') return true;
    return origin === allowed || origin.endsWith(allowed.replace(/^\*/, ''));
  });
}

function mintEmbedToken({ app, dashboardId, user, origin }) {
  const project = getProjectConfig(dashboardId);
  if (!project) throw new Error('Dashboard not found');

  const config = project.config;
  if (!config.isPublished) throw new Error('Dashboard is not published');

  if (!isOriginAllowed(app, origin)) {
    throw new Error('Origin is not allowed for this embed app');
  }

  const scope = extractDashboardScope(config);
  const userId = user?.id || user?.userId || 'anonymous';
  const email = user?.email || null;
  const roles = Array.isArray(user?.roles) ? user.roles : [];

  const token = signEmbedToken({
    sub: String(userId),
    email,
    roles,
    dashboardId: String(dashboardId),
    appId: app.id,
    datasetIds: scope.datasetIds,
    connectorIds: scope.connectorIds,
  });

  return {
    token,
    expiresIn: TOKEN_TTL_SECONDS,
    dashboardId: String(dashboardId),
  };
}

function getPublishedDashboard(dashboardId, tokenPayload) {
  if (tokenPayload.dashboardId !== String(dashboardId)) {
    throw new Error('Token does not match requested dashboard');
  }
  const project = getProjectConfig(dashboardId);
  if (!project) throw new Error('Dashboard not found');
  if (!project.config.isPublished) throw new Error('Dashboard is not published');
  return {
    id: project.id,
    ...project.config,
    publishedAt: project.config.publishedAt || project.updatedAt,
  };
}

function unpublishDashboard(dashboardId) {
  const project = getProjectConfig(dashboardId);
  if (!project) throw new Error('Dashboard not found');
  const config = { ...project.config, isPublished: false };
  delete config.publishedAt;
  const configStr = JSON.stringify({ ...config, id: dashboardId });
  db.prepare(`
    UPDATE projects SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(configStr, dashboardId);
  return { success: true, id: dashboardId, isPublished: false };
}

function publishDashboard(dashboardId, embedSettings = {}) {
  const project = getProjectConfig(dashboardId);
  if (!project) throw new Error('Dashboard not found');
  const config = {
    ...project.config,
    isPublished: true,
    publishedAt: new Date().toISOString(),
    embedSettings: {
      allowedOrigins: embedSettings.allowedOrigins || project.config.embedSettings?.allowedOrigins || [],
      hideBranding: embedSettings.hideBranding ?? project.config.embedSettings?.hideBranding ?? false,
      defaultScaleType: embedSettings.defaultScaleType || project.config.embedSettings?.defaultScaleType || null,
    },
  };
  const configStr = JSON.stringify({ ...config, id: dashboardId });
  db.prepare(`
    UPDATE projects SET config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(configStr, dashboardId);
  return { success: true, id: dashboardId, isPublished: true, publishedAt: config.publishedAt };
}

function assertEmbedDatasetAccess(tokenPayload, datasetId) {
  if (!tokenPayload.datasetIds?.includes(String(datasetId))) {
    throw new Error('Embed token does not grant access to this dataset');
  }
}

function assertEmbedConnectorAccess(tokenPayload, connectorId) {
  if (!tokenPayload.connectorIds?.includes(String(connectorId))) {
    throw new Error('Embed token does not grant access to this connector');
  }
}

function parseBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

module.exports = {
  TOKEN_TTL_SECONDS,
  signEmbedToken,
  verifyEmbedToken,
  createEmbedApp,
  listEmbedApps,
  rotateEmbedAppKey,
  updateEmbedAppOrigins,
  getEmbedAppByApiKey,
  getEmbedAppById,
  mintEmbedToken,
  getPublishedDashboard,
  publishDashboard,
  unpublishDashboard,
  extractDashboardScope,
  assertEmbedDatasetAccess,
  assertEmbedConnectorAccess,
  parseBearerToken,
  isOriginAllowed,
};
