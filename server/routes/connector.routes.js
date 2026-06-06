const db = require('../db/index');
const { ENGINES, sanitizeConfigInput } = require('../connector.config');
const { mergeConfigWithSecrets } = require('../connector.crypto');
const {
  testConnection,
  listSchemas,
  listTables,
  listColumns,
  runReadOnlyQuery,
  formatConnectorRow,
  DEFAULT_LIMIT,
} = require('../connector.service');
const {
  verifyEmbedToken,
  assertEmbedConnectorAccess,
  parseBearerToken,
} = require('../embed.service');
const { getConnectorRow } = require('../dataset.refresh');

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

function tryResolveEmbedContext(req) {
  const token = parseBearerToken(req.headers.authorization);
  if (!token) return null;
  try {
    return verifyEmbedToken(token);
  } catch {
    return null;
  }
}

function mountConnectorRoutes(app) {
  app.get('/api/connectors/engines', (req, res) => {
    res.json(Object.values(ENGINES));
  });

  app.get('/api/connectors', async (req, res) => {
    try {
      const rows = await db.queryAll('SELECT * FROM db_connectors ORDER BY updated_at DESC');
      res.json(rows.map(formatConnectorRow));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/connectors/:id', async (req, res) => {
    try {
      const row = await getConnectorRow(req.params.id);
      if (!row) return res.status(404).json({ error: 'Connector not found' });
      res.json(formatConnectorRow(row));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/connectors', async (req, res) => {
    const { id, name, engine, config } = req.body;
    if (!id || !name || !engine) {
      return res.status(400).json({ error: 'id, name, and engine are required' });
    }
    try {
      const safeConfig = sanitizeConfigInput(config || req.body, engine);
      const storedConfig = storeConnectorConfig(safeConfig, req.body);
      const configStr = JSON.stringify(storedConfig);

      await db.execute(
        `INSERT INTO db_connectors (id, name, engine, config, status, updated_at)
         VALUES (?, ?, ?, ?, 'unknown', CURRENT_TIMESTAMP)`,
        [id, name, engine, configStr]
      );

      res.json({ success: true, id });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put('/api/connectors/:id', async (req, res) => {
    const { name, engine, config } = req.body;
    try {
      const existing = await getConnectorRow(req.params.id);
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

      await db.execute(
        `UPDATE db_connectors
         SET name = ?, engine = ?, config = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [name || existing.name, nextEngine, JSON.stringify(storedConfig), req.params.id]
      );

      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/connectors/:id', async (req, res) => {
    try {
      const refs = await db.queryOne(
        'SELECT COUNT(*) AS count FROM datasets WHERE connector_id = ?',
        [req.params.id]
      );
      const count = parseInt(refs?.count || '0', 10);
      if (count > 0) {
        return res.status(409).json({
          error: 'Cannot delete connector: datasets still reference it',
          datasetCount: count,
        });
      }
      const info = await db.execute('DELETE FROM db_connectors WHERE id = ?', [req.params.id]);
      if (info.changes === 0) return res.status(404).json({ error: 'Connector not found' });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/connectors/:id/test', async (req, res) => {
    try {
      const row = await getConnectorRow(req.params.id);
      if (!row) return res.status(404).json({ error: 'Connector not found' });

      const result = await testConnection(row.config, row.engine);
      await db.execute(
        `UPDATE db_connectors
         SET status = 'connected', status_message = ?, last_tested_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [result.message, req.params.id]
      );

      res.json(result);
    } catch (error) {
      await db.execute(
        `UPDATE db_connectors
         SET status = 'error', status_message = ?, last_tested_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [error.message, req.params.id]
      );
      res.status(400).json({ ok: false, error: error.message });
    }
  });

  app.get('/api/connectors/:id/schemas', async (req, res) => {
    try {
      const row = await getConnectorRow(req.params.id);
      if (!row) return res.status(404).json({ error: 'Connector not found' });
      const schemas = await listSchemas(row.config, row.engine);
      res.json(schemas);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/connectors/:id/tables', async (req, res) => {
    try {
      const row = await getConnectorRow(req.params.id);
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
      const row = await getConnectorRow(req.params.id);
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

      const row = await getConnectorRow(req.params.id);
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
}

module.exports = { mountConnectorRoutes };
