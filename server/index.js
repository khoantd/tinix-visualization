const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');

dotenv.config();

const db = require('./db');

const { analyzeDatasetSchema, suggestCharts } = require('./ai.service');
const {
  resolveProvider,
  getAvailableProviders,
  getDefaultProviderId,
} = require('./ai.config');

const {
  ENGINES,
  sanitizeConfigInput,
} = require('./connector.config');
const {
  mergeConfigWithSecrets,
} = require('./connector.crypto');
const {
  testConnection,
  listSchemas,
  listTables,
  listColumns,
  runReadOnlyQuery,
  buildTableSelect,
  formatConnectorRow,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} = require('./connector.service');

const {
  TOKEN_TTL_SECONDS,
  verifyEmbedToken,
  createEmbedApp,
  listEmbedApps,
  rotateEmbedAppKey,
  updateEmbedAppOrigins,
  mintEmbedToken,
  getPublishedDashboard,
  publishDashboard,
  unpublishDashboard,
  assertEmbedDatasetAccess,
  assertEmbedConnectorAccess,
  parseBearerToken,
  getEmbedAppByApiKey,
} = require('./embed.service');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

function tryResolveEmbedContext(req) {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return null;
  try {
    return verifyEmbedToken(token);
  } catch {
    return null;
  }
}

function requireEmbedContext(req, res) {
  const ctx = tryResolveEmbedContext(req);
  if (!ctx) {
    res.status(401).json({ error: 'Valid embed token required' });
    return null;
  }
  return ctx;
}

function getAiSetting() {
  try {
    const row = db.prepare('SELECT config FROM system_settings WHERE id = ?').get('ai_setting');
    return row ? JSON.parse(row.config) : null;
  } catch {
    return null;
  }
}

function resolveAutoBiProvider(requestProvider) {
  const saved = getAiSetting();
  const resolved = resolveProvider(requestProvider, saved?.activeProvider);
  if (!resolved) {
    throw new Error(
      'Chưa cấu hình AI provider. Sao chép .env.example thành .env và điền OPENROUTER_API_KEY hoặc LITELLM_BASE_URL.'
    );
  }
  return resolved;
}

// --- Auto-BI AI Routes ---

app.get('/api/auto-bi/providers', (req, res) => {
  try {
    const saved = getAiSetting();
    const defaultProvider = getDefaultProviderId();
    const activeProvider = resolveProvider(saved?.activeProvider, null) || defaultProvider;

    res.json({
      providers: getAvailableProviders(),
      activeProvider,
      defaultProvider,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auto-bi/analyze', async (req, res) => {
  try {
    const { sampleData, provider } = req.body;
    const resolvedProvider = resolveAutoBiProvider(provider);
    const analysis = await analyzeDatasetSchema(sampleData, resolvedProvider);
    res.json(analysis);
  } catch (err) {
    const status = err.message.includes('Chưa cấu hình') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

app.post('/api/auto-bi/suggest', async (req, res) => {
  try {
    const { confirmedSchema, provider } = req.body;
    const resolvedProvider = resolveAutoBiProvider(provider);
    const suggestions = await suggestCharts(confirmedSchema, resolvedProvider);
    res.json(suggestions);
  } catch (err) {
    const status = err.message.includes('Chưa cấu hình') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

// --- API EMBED ---

app.get('/api/embed/config', (req, res) => {
  res.json({ tokenTtlSeconds: TOKEN_TTL_SECONDS });
});

app.get('/api/embed/apps', (req, res) => {
  try {
    res.json(listEmbedApps());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/embed/apps', (req, res) => {
  try {
    const { name, allowedOrigins } = req.body;
    const app = createEmbedApp({ name, allowedOrigins });
    res.json(app);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/embed/apps/:id/rotate', (req, res) => {
  try {
    const result = rotateEmbedAppKey(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.put('/api/embed/apps/:id/origins', (req, res) => {
  try {
    const result = updateEmbedAppOrigins(req.params.id, req.body.allowedOrigins);
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.post('/api/embed/token', (req, res) => {
  try {
    const apiKey = req.headers['x-embed-api-key'];
    if (!apiKey) return res.status(401).json({ error: 'X-Embed-Api-Key header is required' });

    const app = getEmbedAppByApiKey(apiKey);
    if (!app) return res.status(401).json({ error: 'Invalid embed API key' });

    const { dashboardId, user } = req.body;
    if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });

    const origin = req.headers.origin || req.headers.referer || null;
    const result = mintEmbedToken({
      app,
      dashboardId,
      user: user || {},
      origin,
    });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('not published') ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
});

app.get('/api/embed/dashboard/:id', (req, res) => {
  try {
    const ctx = requireEmbedContext(req, res);
    if (!ctx) return;

    const dashboard = getPublishedDashboard(req.params.id, ctx);
    res.json(dashboard);
  } catch (error) {
    const status = error.message.includes('not published') ? 403 : 404;
    res.status(status).json({ error: error.message });
  }
});

app.post('/api/embed/publish', (req, res) => {
  try {
    const { dashboardId, embedSettings } = req.body;
    if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });
    const result = publishDashboard(dashboardId, embedSettings || {});
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

app.post('/api/embed/revoke', (req, res) => {
  try {
    const { dashboardId } = req.body;
    if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });
    const result = unpublishDashboard(dashboardId);
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// Preview token for TiniX UI embed panel (local-first; not for production parent apps)
app.post('/api/embed/preview-token', (req, res) => {
  try {
    const { dashboardId, user } = req.body;
    if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });
    const result = mintEmbedToken({
      app: { id: 'tinix-preview', allowed_origins: [] },
      dashboardId,
      user: user || { id: 'preview', roles: ['viewer'] },
      origin: null,
    });
    res.json(result);
  } catch (error) {
    const status = error.message.includes('not published') ? 403 : 400;
    res.status(status).json({ error: error.message });
  }
});

// --- API PROJECTS ---

// Lấy danh sách dự án
app.get('/api/projects', (req, res) => {
  try {
    const projects = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
    const result = projects.map(p => {
      const config = JSON.parse(p.config);
      return { ...config, id: p.id };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lưu hoặc cập nhật dự án
app.get('/api/projects/:id', (req, res) => {
  try {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({
      id: project.id,
      ...JSON.parse(project.config)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', (req, res) => {
  const { id, ...config } = req.body;
  if (!id) return res.status(400).json({ error: 'ID is required' });

  try {
    const configStr = JSON.stringify({ ...config, id });
    const stmt = db.prepare(`
      INSERT INTO projects (id, config, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        config=excluded.config,
        updated_at=CURRENT_TIMESTAMP
    `);
    stmt.run(id, configStr);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/projects/:id', (req, res) => {
  const { id } = req.params;
  try {
    console.log(`[DELETE_PROJECT] Attempting to delete ID: ${id}`);
    const info = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    
    if (info.changes > 0) {
      console.log(`[DELETE_PROJECT] Success: Deleted ID ${id}`);
      res.json({ success: true, changes: info.changes });
    } else {
      console.warn(`[DELETE_PROJECT] Not Found: No project with ID ${id}`);
      res.status(404).json({ success: false, error: 'Project not found' });
    }
  } catch (error) {
    console.error(`[DELETE_PROJECT] 500: Error deleting ${id}`, error);
    res.status(500).json({ error: error.message });
  }
});

// --- API USER TEMPLATES ---

// Lấy danh sách mẫu cá nhân
app.get('/api/user-templates', (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM user_templates ORDER BY created_at DESC').all();
    const result = templates.map(t => ({
      id: t.id,
      title: t.title,
      image: t.image,
      config: JSON.parse(t.config),
      createTime: t.created_at
    }));
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Lưu mẫu cá nhân
app.post('/api/user-templates', (req, res) => {
  const { id, title, image, config } = req.body;
  try {
    const configStr = JSON.stringify(config);
    db.prepare('INSERT OR REPLACE INTO user_templates (id, title, image, config) VALUES (?, ?, ?, ?)')
      .run(id, title, image, configStr);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Xóa mẫu cá nhân
app.delete('/api/user-templates/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM user_templates WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- API TEMPLATE OVERRIDES ---

app.get('/api/template-overrides', (req, res) => {
  try {
    const overrides = db.prepare('SELECT * FROM template_overrides').all();
    res.json(overrides.map(o => JSON.parse(o.config)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/template-overrides', (req, res) => {
  const list = req.body; // Mảng các model ghi đè
  try {
    db.transaction(() => {
      db.prepare('DELETE FROM template_overrides').run();
      const insert = db.prepare('INSERT INTO template_overrides (id, config) VALUES (?, ?)');
      for (const item of list) {
        insert.run(item.id, JSON.stringify(item));
      }
    })();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- API SYSTEM TEMPLATES (ADMIN) ---

app.get('/api/system-templates', (req, res) => {
  try {
    const templates = db.prepare('SELECT * FROM system_templates').all();
    res.json(templates.map(t => ({
      id: t.id,
      title: t.title,
      category: t.category,
      image: t.image,
      config: JSON.parse(t.config)
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/system-templates', (req, res) => {
  const { id, title, image, config } = req.body;
  try {
    const configStr = JSON.stringify(config);
    db.prepare('INSERT OR REPLACE INTO system_templates (id, title, image, config) VALUES (?, ?, ?, ?)')
      .run(id, title, image, configStr);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// APIs cho Datasets

function formatDatasetRow(d, options = {}) {
  const { includeContent = true } = options;
  const sourceType = d.source_type || 'upload';
  const row = {
    id: d.id,
    name: d.name,
    type: d.type,
    source_type: sourceType,
    connector_id: d.connector_id || null,
    sql_query: d.sql_query || null,
    graphql_variables: d.graphql_variables ? JSON.parse(d.graphql_variables) : null,
    graphql_root_field: d.graphql_root_field || null,
    table_ref: d.table_ref ? JSON.parse(d.table_ref) : null,
    refresh_policy: d.refresh_policy || 'manual',
    bi_config: d.bi_config ? JSON.parse(d.bi_config) : null,
    updated_at: d.updated_at,
  };

  if (includeContent || sourceType === 'upload') {
    row.content = JSON.parse(d.content);
  }

  if (d.connector_id) {
    const connector = db.prepare('SELECT name FROM db_connectors WHERE id = ?').get(d.connector_id);
    row.connector_name = connector ? connector.name : null;
  }

  return row;
}

function extractConnectorSecrets(body) {
  return {
    password: body.password,
    token: body.token,
    apiKey: body.apiKey,
    basicPassword: body.basicPassword,
  };
}

function storeConnectorConfig(safeConfig, body, existingConfig = {}) {
  return mergeConfigWithSecrets(safeConfig, extractConnectorSecrets(body), existingConfig);
}

function getConnectorRow(id) {
  const row = db.prepare('SELECT * FROM db_connectors WHERE id = ?').get(id);
  if (!row) return null;
  return row;
}

async function refreshDatasetContent(dataset) {
  const sourceType = dataset.source_type || 'upload';
  if (sourceType === 'upload') {
    return JSON.parse(dataset.content);
  }

  const connector = getConnectorRow(dataset.connector_id);
  if (!connector) {
    throw new Error('Connector not found for dataset');
  }

  let result;
  if (sourceType === 'sql') {
    if (!dataset.sql_query) throw new Error('SQL query missing for dataset');
    result = await runReadOnlyQuery(connector.config, connector.engine, dataset.sql_query, MAX_LIMIT);
  } else if (sourceType === 'graphql') {
    if (!dataset.sql_query) throw new Error('GraphQL query missing for dataset');
    const variables = dataset.graphql_variables ? JSON.parse(dataset.graphql_variables) : {};
    result = await runReadOnlyQuery(
      connector.config,
      connector.engine,
      dataset.sql_query,
      MAX_LIMIT,
      {
        query: dataset.sql_query,
        variables,
        rootField: dataset.graphql_root_field || null,
      }
    );
  } else if (sourceType === 'table') {
    const tableRef = dataset.table_ref ? JSON.parse(dataset.table_ref) : null;
    if (!tableRef?.table) throw new Error('Table reference missing for dataset');
    const sql = buildTableSelect(connector.engine, tableRef.schema, tableRef.table, MAX_LIMIT);
    result = await runReadOnlyQuery(connector.config, connector.engine, sql, MAX_LIMIT);
  } else {
    throw new Error(`Unknown source_type: ${sourceType}`);
  }

  const contentStr = JSON.stringify(result.rows);
  db.prepare(`
    UPDATE datasets SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(contentStr, dataset.id);

  return result.rows;
}

app.get('/api/datasets', (req, res) => {
  try {
    const includeContent = req.query.includeContent === 'true';
    const datasets = db.prepare('SELECT * FROM datasets ORDER BY updated_at DESC').all();
    res.json(datasets.map(d => formatDatasetRow(d, {
      includeContent: includeContent || (d.source_type || 'upload') === 'upload',
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/datasets/:id', async (req, res) => {
  const datasetId = req.params.id;
  const { includeMeta } = req.query;
  try {
    const embedCtx = tryResolveEmbedContext(req);
    if (embedCtx) {
      try {
        assertEmbedDatasetAccess(embedCtx, datasetId);
      } catch (accessErr) {
        return res.status(403).json({ error: accessErr.message });
      }
    }

    console.log(`[DATASET_FETCH] Requesting ID: ${datasetId} (Meta: ${includeMeta})`);
    const dataset = db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId);
    if (!dataset) {
      console.warn(`[DATASET_FETCH] 404: Dataset ${datasetId} not found in DB`);
      return res.status(404).json({ error: 'Dataset not found', requestedId: datasetId });
    }

    const sourceType = dataset.source_type || 'upload';
    if (sourceType !== 'upload' && dataset.refresh_policy === 'on_load') {
      try {
        await refreshDatasetContent(dataset);
        const refreshed = db.prepare('SELECT * FROM datasets WHERE id = ?').get(datasetId);
        Object.assign(dataset, refreshed);
      } catch (refreshErr) {
        console.error(`[DATASET_FETCH] Refresh failed for ${datasetId}`, refreshErr);
      }
    }

    if (includeMeta === 'true') {
      res.json(formatDatasetRow(dataset, { includeContent: true }));
    } else {
      console.log(`[DATASET_FETCH] Success: Returning RAW DATA for ${dataset.name}`);
      res.json(JSON.parse(dataset.content));
    }
  } catch (error) {
    console.error(`[DATASET_FETCH] 500: Error fetching ${datasetId}`, error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint Debug cho FE
app.get('/api/debug/datasets', (req, res) => {
  try {
    const rows = db.prepare('SELECT id, name, updated_at FROM datasets').all();
    res.json({ count: rows.length, datasets: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/datasets', (req, res) => {
  const {
    id, name, type, content, bi_config,
    source_type, connector_id, sql_query, table_ref, refresh_policy,
  } = req.body;
  if (!id || !name || !content) {
    console.error(`[DATASET_SYNC] Validation failed for ${id || 'unknown'}. Missing name or content.`);
    return res.status(400).json({ error: 'id, name, and content are required' });
  }
  try {
    console.log(`[DATASET_SYNC] Mirroring dataset: ${id} (${name})`);
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const biConfigStr = bi_config ? (typeof bi_config === 'string' ? bi_config : JSON.stringify(bi_config)) : null;
    const tableRefStr = table_ref ? (typeof table_ref === 'string' ? table_ref : JSON.stringify(table_ref)) : null;

    const stmt = db.prepare(`
      INSERT INTO datasets (id, name, type, content, bi_config, source_type, connector_id, sql_query, table_ref, refresh_policy, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        type=excluded.type,
        content=excluded.content,
        bi_config=excluded.bi_config,
        source_type=excluded.source_type,
        connector_id=excluded.connector_id,
        sql_query=excluded.sql_query,
        table_ref=excluded.table_ref,
        refresh_policy=excluded.refresh_policy,
        updated_at=CURRENT_TIMESTAMP
    `);
    stmt.run(
      id,
      name,
      type || 'json',
      contentStr,
      biConfigStr,
      source_type || 'upload',
      connector_id || null,
      sql_query || null,
      tableRefStr,
      refresh_policy || 'manual'
    );
    console.log(`[DATASET_SYNC] Success: Persisted ${id} to SQLite`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[DATASET_SYNC] 500: Error persisting ${id}`, error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/datasets/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM datasets WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/datasets/from-query', async (req, res) => {
  const { id, name, connectorId, sql, query, variables, rootField, refreshPolicy, previewLimit } = req.body;
  const queryText = query || sql;
  if (!id || !name || !connectorId || !queryText) {
    return res.status(400).json({ error: 'id, name, connectorId, and query/sql are required' });
  }
  try {
    const connector = getConnectorRow(connectorId);
    if (!connector) return res.status(404).json({ error: 'Connector not found' });

    const isGraphQL = connector.engine === 'graphql';
    const result = await runReadOnlyQuery(
      connector.config,
      connector.engine,
      queryText,
      previewLimit || MAX_LIMIT,
      isGraphQL
        ? { query: queryText, variables: variables || {}, rootField: rootField || null }
        : {}
    );

    const sourceType = isGraphQL ? 'graphql' : 'sql';
    const variablesStr = isGraphQL && variables ? JSON.stringify(variables) : null;

    const stmt = db.prepare(`
      INSERT INTO datasets (id, name, type, content, source_type, connector_id, sql_query, graphql_variables, graphql_root_field, refresh_policy, updated_at)
      VALUES (?, ?, 'json', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        content=excluded.content,
        source_type=excluded.source_type,
        connector_id=excluded.connector_id,
        sql_query=excluded.sql_query,
        graphql_variables=excluded.graphql_variables,
        graphql_root_field=excluded.graphql_root_field,
        refresh_policy=excluded.refresh_policy,
        updated_at=CURRENT_TIMESTAMP
    `);
    stmt.run(
      id,
      name,
      JSON.stringify(result.rows),
      sourceType,
      connectorId,
      queryText,
      variablesStr,
      isGraphQL ? (rootField || result.rootField || null) : null,
      refreshPolicy || 'manual'
    );

    res.json({ success: true, rowCount: result.rowCount, id, rootField: result.rootField || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/datasets/from-table', async (req, res) => {
  const { id, name, connectorId, schema, table, refreshPolicy } = req.body;
  if (!id || !name || !connectorId || !table) {
    return res.status(400).json({ error: 'id, name, connectorId, and table are required' });
  }
  try {
    const connector = getConnectorRow(connectorId);
    if (!connector) return res.status(404).json({ error: 'Connector not found' });

    const sql = buildTableSelect(connector.engine, schema, table, MAX_LIMIT);
    const result = await runReadOnlyQuery(connector.config, connector.engine, sql, MAX_LIMIT);
    const tableRef = JSON.stringify({ schema: schema || (connector.engine === 'sqlite' ? 'main' : schema), table });

    const stmt = db.prepare(`
      INSERT INTO datasets (id, name, type, content, source_type, connector_id, sql_query, table_ref, refresh_policy, updated_at)
      VALUES (?, ?, 'json', ?, 'table', ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        content=excluded.content,
        source_type=excluded.source_type,
        connector_id=excluded.connector_id,
        sql_query=excluded.sql_query,
        table_ref=excluded.table_ref,
        refresh_policy=excluded.refresh_policy,
        updated_at=CURRENT_TIMESTAMP
    `);
    stmt.run(
      id,
      name,
      JSON.stringify(result.rows),
      connectorId,
      sql,
      tableRef,
      refreshPolicy || 'manual'
    );

    res.json({ success: true, rowCount: result.rowCount, id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/datasets/:id/refresh', async (req, res) => {
  try {
    const dataset = db.prepare('SELECT * FROM datasets WHERE id = ?').get(req.params.id);
    if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

    const rows = await refreshDatasetContent(dataset);
    res.json({ success: true, rowCount: rows.length, content: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- API DB CONNECTORS ---

app.get('/api/connectors/engines', (req, res) => {
  res.json(Object.values(ENGINES));
});

app.get('/api/connectors', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM db_connectors ORDER BY updated_at DESC').all();
    res.json(rows.map(formatConnectorRow));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/connectors/:id', (req, res) => {
  try {
    const row = getConnectorRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Connector not found' });
    res.json(formatConnectorRow(row));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/connectors', (req, res) => {
  const { id, name, engine, config } = req.body;
  if (!id || !name || !engine) {
    return res.status(400).json({ error: 'id, name, and engine are required' });
  }
  try {
    const safeConfig = sanitizeConfigInput(config || req.body, engine);
    const storedConfig = storeConnectorConfig(safeConfig, req.body);
    const configStr = JSON.stringify(storedConfig);

    db.prepare(`
      INSERT INTO db_connectors (id, name, engine, config, status, updated_at)
      VALUES (?, ?, ?, ?, 'unknown', CURRENT_TIMESTAMP)
    `).run(id, name, engine, configStr);

    res.json({ success: true, id });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/connectors/:id', (req, res) => {
  const { name, engine, config } = req.body;
  try {
    const existing = getConnectorRow(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Connector not found' });

    const nextEngine = engine || existing.engine;
    const existingConfig = JSON.parse(existing.config);
    const safeConfig = config
      ? sanitizeConfigInput(config, nextEngine)
      : { ...existingConfig };
    delete safeConfig.password_enc;
    delete safeConfig.token_enc;
    delete safeConfig.api_key_enc;
    delete safeConfig.basic_password_enc;

    const storedConfig = storeConnectorConfig(safeConfig, req.body, existingConfig);

    db.prepare(`
      UPDATE db_connectors
      SET name = ?, engine = ?, config = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || existing.name,
      nextEngine,
      JSON.stringify(storedConfig),
      req.params.id
    );

    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/connectors/:id', (req, res) => {
  try {
    const refs = db.prepare(
      "SELECT COUNT(*) AS count FROM datasets WHERE connector_id = ?"
    ).get(req.params.id);
    if (refs.count > 0) {
      return res.status(409).json({
        error: 'Cannot delete connector: datasets still reference it',
        datasetCount: refs.count,
      });
    }
    const info = db.prepare('DELETE FROM db_connectors WHERE id = ?').run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ error: 'Connector not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/connectors/:id/test', async (req, res) => {
  try {
    const row = getConnectorRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Connector not found' });

    const result = await testConnection(row.config, row.engine);
    db.prepare(`
      UPDATE db_connectors
      SET status = 'connected', status_message = ?, last_tested_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(result.message, req.params.id);

    res.json(result);
  } catch (error) {
    db.prepare(`
      UPDATE db_connectors
      SET status = 'error', status_message = ?, last_tested_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(error.message, req.params.id);
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.get('/api/connectors/:id/schemas', async (req, res) => {
  try {
    const row = getConnectorRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Connector not found' });
    const schemas = await listSchemas(row.config, row.engine);
    res.json(schemas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/connectors/:id/tables', async (req, res) => {
  try {
    const row = getConnectorRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Connector not found' });
    const schema = req.query.schema;
    const tables = await listTables(row.config, row.engine, schema);
    res.json(tables);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/connectors/:id/columns', async (req, res) => {
  try {
    const row = getConnectorRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Connector not found' });
    const { schema, table } = req.query;
    if (!table) return res.status(400).json({ error: 'table query param is required' });
    const columns = await listColumns(row.config, row.engine, schema, table);
    res.json(columns);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/connectors/:id/query', async (req, res) => {
  try {
    const embedCtx = tryResolveEmbedContext(req);
    if (embedCtx) {
      try {
        assertEmbedConnectorAccess(embedCtx, req.params.id);
      } catch (accessErr) {
        return res.status(403).json({ error: accessErr.message });
      }
    }

    const row = getConnectorRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Connector not found' });
    const { sql, query, variables, rootField, limit } = req.body;
    const isGraphQL = row.engine === 'graphql';
    const queryText = isGraphQL ? (query || sql) : sql;
    if (!queryText) {
      return res.status(400).json({ error: isGraphQL ? 'query is required' : 'sql is required' });
    }
    const result = await runReadOnlyQuery(
      row.config,
      row.engine,
      queryText,
      limit || DEFAULT_LIMIT,
      isGraphQL ? { query: queryText, variables: variables || {}, rootField: rootField || null } : {}
    );
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message, graphqlErrors: error.graphqlErrors || null });
  }
});

// --- API SYSTEM SETTINGS ---

app.get('/api/system-settings/:id', (req, res) => {
  const { id } = req.params;
  try {
    const setting = db.prepare('SELECT * FROM system_settings WHERE id = ?').get(id);
    // Nếu không tìm thấy, trả về null với 200 OK để tránh lỗi 404 trên console
    if (!setting) return res.json(null);
    res.json(JSON.parse(setting.config));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/system-settings', (req, res) => {
  const { id, config } = req.body;
  if (!id || !config) return res.status(400).json({ error: 'id and config are required' });
  try {
    const configStr = typeof config === 'string' ? config : JSON.stringify(config);
    const stmt = db.prepare(`
      INSERT INTO system_settings (id, config, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        config=excluded.config,
        updated_at=CURRENT_TIMESTAMP
    `);
    stmt.run(id, configStr);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- API PRIVATE PHOTOS ---

app.get('/api/private-photos', (req, res) => {
  try {
    const photos = db.prepare('SELECT * FROM private_photos ORDER BY updated_at DESC').all();
    res.json(photos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/private-photos', (req, res) => {
  const { id, name, content } = req.body;
  if (!id || !name || !content) return res.status(400).json({ error: 'id, name and content are required' });
  try {
    const stmt = db.prepare(`
      INSERT INTO private_photos (id, name, content, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        content=excluded.content,
        updated_at=CURRENT_TIMESTAMP
    `);
    stmt.run(id, name, content);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/private-photos/:id', (req, res) => {
  const { id } = req.params;
  try {
    db.prepare('DELETE FROM private_photos WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`TiniX Visualization Server running at http://localhost:${port}`);
});
