const db = require('../db/index');
const {
  runReadOnlyQuery,
  buildTableSelect,
  MAX_LIMIT,
} = require('../connector.service');
const {
  verifyEmbedToken,
  assertEmbedDatasetAccess,
  parseBearerToken,
} = require('../embed.service');
const { refreshDatasetContent, getConnectorRow } = require('../dataset.refresh');

const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

async function formatDatasetRow(d, options = {}) {
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
    const connector = await db.queryOne('SELECT name FROM db_connectors WHERE id = ?', [d.connector_id]);
    row.connector_name = connector ? connector.name : null;
  }

  return row;
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

function mountDatasetExtensionRoutes(app) {
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

      let dataset = await db.queryOne('SELECT * FROM datasets WHERE id = ?', [datasetId]);
      if (!dataset) {
        return res.status(404).json({ error: 'Dataset not found', requestedId: datasetId });
      }

      const sourceType = dataset.source_type || 'upload';
      if (sourceType !== 'upload' && dataset.refresh_policy === 'on_load') {
        try {
          await refreshDatasetContent(dataset);
          dataset = await db.queryOne('SELECT * FROM datasets WHERE id = ?', [datasetId]);
        } catch (refreshErr) {
          console.error(`[DATASET_FETCH] Refresh failed for ${datasetId}`, refreshErr);
        }
      }

      if (includeMeta === 'true') {
        res.json(await formatDatasetRow(dataset, { includeContent: true }));
      } else {
        res.json(JSON.parse(dataset.content));
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/datasets', async (req, res) => {
    const contentLength = parseInt(req.headers['content-length'] || '0', 10);
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({
        error: 'Payload exceeds 4 MB limit (Vercel serverless constraint).',
      });
    }

    const {
      id,
      name,
      type,
      content,
      bi_config,
      source_type,
      connector_id,
      sql_query,
      table_ref,
      refresh_policy,
      graphql_variables,
      graphql_root_field,
    } = req.body;

    if (!id || !name || !content) {
      return res.status(400).json({ error: 'id, name, and content are required' });
    }

    try {
      const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
      if (Buffer.byteLength(contentStr, 'utf8') > MAX_PAYLOAD_BYTES) {
        return res.status(413).json({
          error: 'Dataset content exceeds 4 MB limit (Vercel serverless constraint).',
        });
      }

      const biConfigStr = bi_config
        ? typeof bi_config === 'string'
          ? bi_config
          : JSON.stringify(bi_config)
        : null;
      const tableRefStr = table_ref
        ? typeof table_ref === 'string'
          ? table_ref
          : JSON.stringify(table_ref)
        : null;
      const variablesStr = graphql_variables
        ? typeof graphql_variables === 'string'
          ? graphql_variables
          : JSON.stringify(graphql_variables)
        : null;

      await db.execute(
        `INSERT INTO datasets (
          id, name, type, content, bi_config, source_type, connector_id,
          sql_query, table_ref, refresh_policy, graphql_variables, graphql_root_field, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          type = excluded.type,
          content = excluded.content,
          bi_config = excluded.bi_config,
          source_type = excluded.source_type,
          connector_id = excluded.connector_id,
          sql_query = excluded.sql_query,
          table_ref = excluded.table_ref,
          refresh_policy = excluded.refresh_policy,
          graphql_variables = excluded.graphql_variables,
          graphql_root_field = excluded.graphql_root_field,
          updated_at = CURRENT_TIMESTAMP`,
        [
          id,
          name,
          type || 'json',
          contentStr,
          biConfigStr,
          source_type || 'upload',
          connector_id || null,
          sql_query || null,
          tableRefStr,
          refresh_policy || 'manual',
          variablesStr,
          graphql_root_field || null,
        ]
      );
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
      const connector = await getConnectorRow(connectorId);
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

      await db.execute(
        `INSERT INTO datasets (
          id, name, type, content, source_type, connector_id, sql_query,
          graphql_variables, graphql_root_field, refresh_policy, updated_at
        )
        VALUES (?, ?, 'json', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          content = excluded.content,
          source_type = excluded.source_type,
          connector_id = excluded.connector_id,
          sql_query = excluded.sql_query,
          graphql_variables = excluded.graphql_variables,
          graphql_root_field = excluded.graphql_root_field,
          refresh_policy = excluded.refresh_policy,
          updated_at = CURRENT_TIMESTAMP`,
        [
          id,
          name,
          JSON.stringify(result.rows),
          sourceType,
          connectorId,
          queryText,
          variablesStr,
          isGraphQL ? (rootField || result.rootField || null) : null,
          refreshPolicy || 'manual',
        ]
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
      const connector = await getConnectorRow(connectorId);
      if (!connector) return res.status(404).json({ error: 'Connector not found' });

      const sql = buildTableSelect(connector.engine, schema, table, MAX_LIMIT);
      const result = await runReadOnlyQuery(connector.config, connector.engine, sql, MAX_LIMIT);
      const tableRef = JSON.stringify({
        schema: schema || (connector.engine === 'sqlite' ? 'main' : schema),
        table,
      });

      await db.execute(
        `INSERT INTO datasets (
          id, name, type, content, source_type, connector_id, sql_query, table_ref, refresh_policy, updated_at
        )
        VALUES (?, ?, 'json', ?, 'table', ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          content = excluded.content,
          source_type = excluded.source_type,
          connector_id = excluded.connector_id,
          sql_query = excluded.sql_query,
          table_ref = excluded.table_ref,
          refresh_policy = excluded.refresh_policy,
          updated_at = CURRENT_TIMESTAMP`,
        [
          id,
          name,
          JSON.stringify(result.rows),
          connectorId,
          sql,
          tableRef,
          refreshPolicy || 'manual',
        ]
      );

      res.json({ success: true, rowCount: result.rowCount, id });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/datasets/:id/refresh', async (req, res) => {
    try {
      const dataset = await db.queryOne('SELECT * FROM datasets WHERE id = ?', [req.params.id]);
      if (!dataset) return res.status(404).json({ error: 'Dataset not found' });

      const rows = await refreshDatasetContent(dataset);
      res.json({ success: true, rowCount: rows.length, content: rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = { mountDatasetExtensionRoutes, formatDatasetRow };
