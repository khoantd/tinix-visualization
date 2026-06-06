const db = require('./db/index');
const { analyzeDatasetSchema, suggestCharts } = require('./ai.service');
const { runReadOnlyQuery, DEFAULT_LIMIT, MAX_LIMIT } = require('./connector.service');
const {
  mintEmbedToken,
  publishDashboard,
  unpublishDashboard,
  getEmbedAppByApiKey,
} = require('./embed.service');
const {
  TOKEN_TTL_SECONDS,
  ALL_SCOPES,
  verifyAgentToken,
  createAgentApp,
  listAgentApps,
  updateAgentAppScopes,
  rotateAgentAppKey,
  deleteAgentApp,
  getAgentAppByApiKey,
  mintAgentToken,
  assertScope,
  assertResourceAllowed,
  writeAuditLog,
  listAuditLogs,
  parseBearerToken,
  agentError,
} = require('./agent.service');
const { buildDashboardFromSuggestions, summarizeDashboard } = require('./dashboard.builder');

const AGENT_ROW_CAP = 200;
const IDEMPOTENCY_TTL_HOURS = 24;

function formatDatasetRow(d, options = {}) {
  const { includeContent = true } = options;
  const sourceType = d.source_type || 'upload';
  const row = {
    id: d.id,
    name: d.name,
    type: d.type,
    source_type: sourceType,
    connector_id: d.connector_id || null,
    updated_at: d.updated_at,
  };
  if (includeContent || sourceType === 'upload') {
    try {
      row.content = JSON.parse(d.content);
    } catch {
      row.content = d.content;
    }
  }
  if (d.bi_config) {
    try {
      row.bi_config = JSON.parse(d.bi_config);
    } catch {
      row.bi_config = null;
    }
  }
  return row;
}

async function getDatasetById(id) {
  const d = await db.queryOne('SELECT * FROM datasets WHERE id = ?', [id]);
  if (!d) return null;
  return formatDatasetRow(d);
}

async function saveProject(config) {
  const { id, ...rest } = config;
  const configStr = JSON.stringify({ ...rest, id });
  await db.execute(
    `INSERT INTO projects (id, config, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = CURRENT_TIMESTAMP`,
    [id, configStr]
  );
  return { success: true, id };
}

async function getProjectConfig(projectId) {
  const project = await db.queryOne('SELECT * FROM projects WHERE id = ?', [projectId]);
  if (!project) return null;
  const config = JSON.parse(project.config);
  return { id: project.id, config, updatedAt: project.updated_at };
}

async function getIdempotencyResponse(key) {
  if (!key) return null;
  const row = await db.queryOne(
    'SELECT response FROM agent_idempotency_keys WHERE key = ? AND expires_at > ?',
    [key, new Date().toISOString()]
  );
  if (!row) return null;
  return typeof row.response === 'string' ? JSON.parse(row.response) : row.response;
}

async function storeIdempotencyResponse(key, response) {
  if (!key) return;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_HOURS * 3600000).toISOString();
  await db.execute('DELETE FROM agent_idempotency_keys WHERE expires_at <= ?', [now.toISOString()]);
  await db.execute(
    `INSERT INTO agent_idempotency_keys (key, response, expires_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET response = excluded.response, expires_at = excluded.expires_at`,
    [key, JSON.stringify(response), expiresAt]
  );
}

function createAgentRouter({ resolveAutoBiProvider }) {
  const router = require('express').Router();

  // Per-instance rate limit — not shared across Vercel function instances (MVP).
  const rateLimitMap = new Map();
  function checkRateLimit(apiKey) {
    const windowMs = 15 * 60 * 1000;
    const max = 100;
    const now = Date.now();
    const key = apiKey || 'anonymous';
    let entry = rateLimitMap.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { start: now, count: 0 };
      rateLimitMap.set(key, entry);
    }
    entry.count += 1;
    return entry.count <= max;
  }

  async function requireAgentApiKey(req, res, next) {
    const apiKey = req.headers['x-agent-api-key'];
    if (!apiKey) {
      return res.status(401).json(agentError('API_KEY_REQUIRED', 'X-Agent-Api-Key header is required'));
    }
    if (!checkRateLimit(apiKey)) {
      return res.status(429).json(agentError('RATE_LIMITED', 'Too many requests'));
    }
    const app = await getAgentAppByApiKey(apiKey);
    if (!app) {
      return res.status(401).json(agentError('INVALID_API_KEY', 'Invalid agent API key'));
    }
    req.agentApp = app;
    next();
  }

  function requireAgentToken(requiredScope) {
    return (req, res, next) => {
      const start = Date.now();
      const token = parseBearerToken(req.headers.authorization);
      if (!token) {
        return res.status(401).json(agentError('TOKEN_REQUIRED', 'Bearer agent token is required'));
      }
      try {
        const payload = verifyAgentToken(token);
        if (requiredScope) assertScope(payload, requiredScope);
        req.agentToken = payload;
        req.auditStart = start;
        next();
      } catch (err) {
        const code = err.code || 'INVALID_TOKEN';
        return res.status(err.code === 'SCOPE_DENIED' ? 403 : 401).json(agentError(code, err.message));
      }
    };
  }

  function auditMiddleware(req, res, next) {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (req.agentToken) {
        writeAuditLog({
          appId: req.agentToken.appId,
          principal: req.agentToken.sub,
          toolOrRoute: req.route?.path || req.path,
          resourceIds: req.auditResourceIds || null,
          rowCount: body?.rowCount ?? body?.rows?.length ?? null,
          status: res.statusCode >= 400 ? 'error' : 'ok',
          latencyMs: Date.now() - (req.auditStart || Date.now()),
        }).catch(() => {});
      }
      return originalJson(body);
    };
    next();
  }

  router.use(auditMiddleware);

  router.get('/config', (req, res) => {
    res.json({
      tokenTtlSeconds: TOKEN_TTL_SECONDS,
      scopes: ALL_SCOPES,
      openapiUrl: '/docs/openapi/agent-v1.yaml',
      mcpPackage: 'packages/tinix-mcp',
      rowCap: AGENT_ROW_CAP,
    });
  });

  router.get('/apps', async (req, res) => {
    try {
      res.json(await listAgentApps());
    } catch (err) {
      res.status(500).json(agentError('INTERNAL', err.message));
    }
  });

  router.post('/apps', async (req, res) => {
    try {
      const { name, scopes, allowedResourceIds } = req.body;
      const app = await createAgentApp({ name, scopes, allowedResourceIds });
      res.json(app);
    } catch (err) {
      res.status(400).json(agentError('CREATE_FAILED', err.message));
    }
  });

  router.put('/apps/:id/scopes', async (req, res) => {
    try {
      const result = await updateAgentAppScopes(req.params.id, req.body.scopes, req.body.allowedResourceIds);
      res.json(result);
    } catch (err) {
      res.status(404).json(agentError('NOT_FOUND', err.message));
    }
  });

  router.post('/apps/:id/rotate', async (req, res) => {
    try {
      const result = await rotateAgentAppKey(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(404).json(agentError('NOT_FOUND', err.message));
    }
  });

  router.delete('/apps/:id', async (req, res) => {
    try {
      const result = await deleteAgentApp(req.params.id);
      res.json(result);
    } catch (err) {
      res.status(404).json(agentError('NOT_FOUND', err.message));
    }
  });

  router.post('/token', async (req, res) => {
    try {
      const apiKey = req.headers['x-agent-api-key'];
      if (!apiKey) {
        return res.status(401).json(agentError('API_KEY_REQUIRED', 'X-Agent-Api-Key header is required'));
      }
      const app = await getAgentAppByApiKey(apiKey);
      if (!app) {
        return res.status(401).json(agentError('INVALID_API_KEY', 'Invalid agent API key'));
      }
      const { user, scopes } = req.body || {};
      const result = mintAgentToken({ app, user: user || {}, requestedScopes: scopes });
      res.json(result);
    } catch (err) {
      res.status(400).json(agentError('TOKEN_MINT_FAILED', err.message));
    }
  });

  router.get('/audit', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);
      const appId = req.query.appId || null;
      res.json(await listAuditLogs({ limit, offset, appId }));
    } catch (err) {
      res.status(500).json(agentError('INTERNAL', err.message));
    }
  });

  router.get('/dashboards', requireAgentToken('catalog:read'), async (req, res) => {
    try {
      const projects = await db.queryAll('SELECT * FROM projects ORDER BY updated_at DESC');
      const result = projects.map((p) => {
        const config = JSON.parse(p.config);
        return summarizeDashboard({ ...config, id: p.id, updatedAt: p.updated_at });
      });
      res.json(result);
    } catch (err) {
      res.status(500).json(agentError('INTERNAL', err.message));
    }
  });

  router.get('/dashboards/:id', requireAgentToken('catalog:read'), async (req, res) => {
    try {
      const project = await getProjectConfig(req.params.id);
      if (!project) return res.status(404).json(agentError('NOT_FOUND', 'Dashboard not found'));
      assertResourceAllowed(req.agentToken, 'dashboards', req.params.id);
      req.auditResourceIds = { dashboardId: req.params.id };
      if (req.query.full === '1') {
        return res.json({ id: project.id, ...project.config, updatedAt: project.updatedAt });
      }
      res.json(summarizeDashboard({ ...project.config, id: project.id, updatedAt: project.updatedAt }));
    } catch (err) {
      const status = err.code === 'RESOURCE_DENIED' ? 403 : 500;
      res.status(status).json(agentError(err.code || 'ERROR', err.message));
    }
  });

  router.get('/datasets', requireAgentToken('catalog:read'), async (req, res) => {
    try {
      const datasets = await db.queryAll('SELECT * FROM datasets ORDER BY updated_at DESC');
      res.json(datasets.map((d) => formatDatasetRow(d, { includeContent: false })));
    } catch (err) {
      res.status(500).json(agentError('INTERNAL', err.message));
    }
  });

  router.get('/datasets/:id/schema', requireAgentToken('catalog:read'), async (req, res) => {
    try {
      assertResourceAllowed(req.agentToken, 'datasets', req.params.id);
      const dataset = await getDatasetById(req.params.id);
      if (!dataset) return res.status(404).json(agentError('NOT_FOUND', 'Dataset not found'));
      const content = Array.isArray(dataset.content) ? dataset.content : [];
      const sample = content.slice(0, 15);
      const columns = sample.length > 0
        ? Object.keys(sample[0]).map((k) => ({ name: k, sample: sample[0][k] }))
        : [];
      req.auditResourceIds = { datasetId: req.params.id };
      res.json({ id: dataset.id, name: dataset.name, columns, sampleRows: sample, rowCount: content.length });
    } catch (err) {
      const status = err.code === 'RESOURCE_DENIED' ? 403 : 500;
      res.status(status).json(agentError(err.code || 'ERROR', err.message));
    }
  });

  router.post('/datasets/:id/sample', requireAgentToken('data:read'), async (req, res) => {
    try {
      assertResourceAllowed(req.agentToken, 'datasets', req.params.id);
      const dataset = await getDatasetById(req.params.id);
      if (!dataset) return res.status(404).json(agentError('NOT_FOUND', 'Dataset not found'));
      const content = Array.isArray(dataset.content) ? dataset.content : [];
      const limit = Math.min(parseInt(req.body?.limit || AGENT_ROW_CAP, 10), AGENT_ROW_CAP);
      const offset = Math.max(0, parseInt(req.body?.offset || '0', 10));
      const rows = content.slice(offset, offset + limit);
      req.auditResourceIds = { datasetId: req.params.id };
      res.json({ rows, rowCount: rows.length, total: content.length, offset, limit });
    } catch (err) {
      const status = err.code === 'RESOURCE_DENIED' ? 403 : 500;
      res.status(status).json(agentError(err.code || 'ERROR', err.message));
    }
  });

  router.post('/connectors/:id/query', requireAgentToken('data:read'), async (req, res) => {
    try {
      assertResourceAllowed(req.agentToken, 'connectors', req.params.id);
      const connector = await db.queryOne('SELECT * FROM db_connectors WHERE id = ?', [req.params.id]);
      if (!connector) return res.status(404).json(agentError('NOT_FOUND', 'Connector not found'));
      const limit = Math.min(parseInt(req.body?.limit || DEFAULT_LIMIT, 10), MAX_LIMIT, AGENT_ROW_CAP);
      const { sql, query, variables, rootField } = req.body;
      const isGraphQL = connector.engine === 'graphql';
      const queryText = isGraphQL ? (query || sql) : sql;
      if (!queryText) {
        return res.status(400).json(agentError('VALIDATION', isGraphQL ? 'query is required' : 'sql is required'));
      }
      const config = typeof connector.config === 'string' ? JSON.parse(connector.config) : connector.config;
      const result = await runReadOnlyQuery(
        config,
        connector.engine,
        queryText,
        limit,
        isGraphQL ? { query: queryText, variables: variables || {}, rootField: rootField || null } : {}
      );
      req.auditResourceIds = { connectorId: req.params.id };
      res.json({ ...result, rowCount: result.rows?.length ?? 0 });
    } catch (err) {
      const status = err.code === 'RESOURCE_DENIED' ? 403 : 400;
      res.status(status).json(agentError(err.code || 'QUERY_FAILED', err.message));
    }
  });

  router.post('/auto-bi/analyze', requireAgentToken('auto_bi'), async (req, res) => {
    try {
      const { sampleData, provider } = req.body;
      const resolvedProvider = await resolveAutoBiProvider(provider);
      const analysis = await analyzeDatasetSchema(sampleData, resolvedProvider);
      res.json(analysis);
    } catch (err) {
      const status = err.message.includes('Chưa cấu hình') ? 400 : 500;
      res.status(status).json(agentError('ANALYZE_FAILED', err.message));
    }
  });

  router.post('/auto-bi/suggest', requireAgentToken('auto_bi'), async (req, res) => {
    try {
      const { confirmedSchema, provider } = req.body;
      const resolvedProvider = await resolveAutoBiProvider(provider);
      const suggestions = await suggestCharts(confirmedSchema, resolvedProvider);
      res.json(suggestions);
    } catch (err) {
      const status = err.message.includes('Chưa cấu hình') ? 400 : 500;
      res.status(status).json(agentError('SUGGEST_FAILED', err.message));
    }
  });

  router.post('/auto-bi/generate', requireAgentToken('dashboard:write'), async (req, res) => {
    try {
      const {
        datasetId,
        projectName,
        theme,
        charts,
        executiveSummary,
        confirmedSchema,
        provider,
        autoSuggest,
      } = req.body;

      if (!datasetId) return res.status(400).json(agentError('VALIDATION', 'datasetId is required'));
      assertResourceAllowed(req.agentToken, 'datasets', datasetId);

      const dataset = await getDatasetById(datasetId);
      if (!dataset) return res.status(404).json(agentError('NOT_FOUND', 'Dataset not found'));

      let selectedCharts = charts;
      let summary = executiveSummary || '';
      let selectedTheme = theme || 'chalk';

      if (autoSuggest || !selectedCharts?.length) {
        const resolvedProvider = await resolveAutoBiProvider(provider);
        const schema = confirmedSchema || await analyzeDatasetSchema(
          (dataset.content || []).slice(0, 15),
          resolvedProvider
        );
        const suggestions = await suggestCharts(schema, resolvedProvider);
        selectedCharts = (suggestions.charts || []).filter((c) => c.selected !== false);
        summary = summary || suggestions.executiveSummary || '';
        selectedTheme = selectedTheme || suggestions.suggestedTheme || 'chalk';
      }

      const { projectConfig, projectId } = buildDashboardFromSuggestions({
        datasetId,
        datasetName: dataset.name,
        datasetContent: dataset.content,
        charts: selectedCharts,
        executiveSummary: summary,
        theme: selectedTheme,
        projectName,
      });

      await saveProject(projectConfig);
      req.auditResourceIds = { dashboardId: projectId, datasetId };
      res.json({
        success: true,
        dashboardId: projectId,
        title: projectConfig.title,
        componentCount: projectConfig.componentList.length,
        editorUrl: `/#/chart/home/${projectId}`,
      });
    } catch (err) {
      res.status(400).json(agentError('GENERATE_FAILED', err.message));
    }
  });

  router.post('/dashboards', requireAgentToken('dashboard:write'), async (req, res) => {
    try {
      const idempotencyKey = req.headers['idempotency-key'];
      if (idempotencyKey) {
        const cached = await getIdempotencyResponse(idempotencyKey);
        if (cached) return res.json(cached);
      }

      const { datasetId, projectName, theme, charts, executiveSummary } = req.body;
      const dataset = await getDatasetById(datasetId);
      if (!dataset) return res.status(404).json(agentError('NOT_FOUND', 'Dataset not found'));
      assertResourceAllowed(req.agentToken, 'datasets', datasetId);

      const { projectConfig, projectId } = buildDashboardFromSuggestions({
        datasetId,
        datasetName: dataset.name,
        datasetContent: dataset.content,
        charts,
        executiveSummary,
        theme,
        projectName,
      });

      await saveProject(projectConfig);
      const result = { success: true, dashboardId: projectId, title: projectConfig.title };
      if (idempotencyKey) await storeIdempotencyResponse(idempotencyKey, result);
      req.auditResourceIds = { dashboardId: projectId };
      res.json(result);
    } catch (err) {
      res.status(400).json(agentError('CREATE_FAILED', err.message));
    }
  });

  router.patch('/dashboards/:id', requireAgentToken('dashboard:write'), async (req, res) => {
    try {
      const project = await getProjectConfig(req.params.id);
      if (!project) return res.status(404).json(agentError('NOT_FOUND', 'Dashboard not found'));
      assertResourceAllowed(req.agentToken, 'dashboards', req.params.id);

      const config = { ...project.config };
      if (req.body.title) {
        config.title = req.body.title;
        config.editCanvasConfig = { ...config.editCanvasConfig, projectName: req.body.title };
      }
      if (req.body.theme) {
        config.editCanvasConfig = { ...config.editCanvasConfig, chartThemeColor: req.body.theme };
      }

      await saveProject({ ...config, id: req.params.id });
      req.auditResourceIds = { dashboardId: req.params.id };
      res.json({ success: true, id: req.params.id });
    } catch (err) {
      const status = err.code === 'RESOURCE_DENIED' ? 403 : 400;
      res.status(status).json(agentError(err.code || 'UPDATE_FAILED', err.message));
    }
  });

  router.post('/dashboards/:id/generate', requireAgentToken('dashboard:write'), async (req, res) => {
    try {
      const { datasetId, charts, executiveSummary, theme, projectName } = req.body;
      if (!datasetId) return res.status(400).json(agentError('VALIDATION', 'datasetId is required'));

      const dataset = await getDatasetById(datasetId);
      if (!dataset) return res.status(404).json(agentError('NOT_FOUND', 'Dataset not found'));

      const { projectConfig } = buildDashboardFromSuggestions({
        datasetId,
        datasetName: dataset.name,
        datasetContent: dataset.content,
        charts,
        executiveSummary,
        theme,
        projectName,
        projectId: req.params.id,
      });

      await saveProject(projectConfig);
      req.auditResourceIds = { dashboardId: req.params.id };
      res.json({ success: true, dashboardId: req.params.id });
    } catch (err) {
      res.status(400).json(agentError('REGENERATE_FAILED', err.message));
    }
  });

  router.post('/dashboards/:id/publish', requireAgentToken('dashboard:publish'), async (req, res) => {
    try {
      assertResourceAllowed(req.agentToken, 'dashboards', req.params.id);
      const result = await publishDashboard(req.params.id, req.body.embedSettings || {});
      req.auditResourceIds = { dashboardId: req.params.id };
      res.json(result);
    } catch (err) {
      res.status(404).json(agentError('NOT_FOUND', err.message));
    }
  });

  router.post('/dashboards/:id/unpublish', requireAgentToken('dashboard:publish'), async (req, res) => {
    try {
      assertResourceAllowed(req.agentToken, 'dashboards', req.params.id);
      const result = await unpublishDashboard(req.params.id);
      req.auditResourceIds = { dashboardId: req.params.id };
      res.json(result);
    } catch (err) {
      res.status(404).json(agentError('NOT_FOUND', err.message));
    }
  });

  router.post('/embed/token', requireAgentToken('embed:mint'), async (req, res) => {
    try {
      const embedApiKey = req.headers['x-embed-api-key'];
      if (!embedApiKey) {
        return res.status(400).json(agentError('EMBED_KEY_REQUIRED', 'X-Embed-Api-Key required for embed token minting'));
      }
      const embedApp = await getEmbedAppByApiKey(embedApiKey);
      if (!embedApp) {
        return res.status(401).json(agentError('INVALID_EMBED_KEY', 'Invalid embed API key'));
      }
      const { dashboardId, user } = req.body;
      if (!dashboardId) return res.status(400).json(agentError('VALIDATION', 'dashboardId is required'));
      const result = await mintEmbedToken({
        app: embedApp,
        dashboardId,
        user: user || {},
        origin: null,
      });
      req.auditResourceIds = { dashboardId };
      res.json(result);
    } catch (err) {
      const status = err.message?.includes('not published') ? 403 : 400;
      res.status(status).json(agentError('EMBED_MINT_FAILED', err.message));
    }
  });

  return router;
}

module.exports = { createAgentRouter };
