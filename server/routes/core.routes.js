const db = require('../db/index');

const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

function assertPayloadSize(req, res) {
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_PAYLOAD_BYTES) {
    res.status(413).json({
      error: 'Payload exceeds 4 MB limit (Vercel serverless constraint). Use a smaller dataset or split the upload.',
    });
    return false;
  }
  return true;
}

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

  return row;
}

function mountCoreRoutes(app, options = {}) {
  const { skipDatasetDetailRoutes = false } = options;
  // --- Projects ---
  app.get('/api/projects', async (req, res) => {
    try {
      const projects = await db.queryAll('SELECT * FROM projects ORDER BY updated_at DESC');
      const result = projects.map((p) => {
        const config = JSON.parse(p.config);
        return { ...config, id: p.id };
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/projects/:id', async (req, res) => {
    try {
      const project = await db.queryOne('SELECT * FROM projects WHERE id = ?', [req.params.id]);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json({ id: project.id, ...JSON.parse(project.config) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/projects', async (req, res) => {
    const { id, ...config } = req.body;
    if (!id) return res.status(400).json({ error: 'ID is required' });
    try {
      const configStr = JSON.stringify({ ...config, id });
      await db.execute(
        `INSERT INTO projects (id, config, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           config = EXCLUDED.config,
           updated_at = CURRENT_TIMESTAMP`,
        [id, configStr]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const info = await db.execute('DELETE FROM projects WHERE id = ?', [id]);
      if (info.changes > 0) {
        res.json({ success: true, changes: info.changes });
      } else {
        res.status(404).json({ success: false, error: 'Project not found' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- User templates ---
  app.get('/api/user-templates', async (req, res) => {
    try {
      const templates = await db.queryAll('SELECT * FROM user_templates ORDER BY created_at DESC');
      res.json(
        templates.map((t) => ({
          id: t.id,
          title: t.title,
          image: t.image,
          config: JSON.parse(t.config),
          createTime: t.created_at,
        }))
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/user-templates', async (req, res) => {
    const { id, title, image, config } = req.body;
    try {
      const configStr = JSON.stringify(config);
      await db.execute(
        `INSERT INTO user_templates (id, title, image, config)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = EXCLUDED.title,
           image = EXCLUDED.image,
           config = EXCLUDED.config`,
        [id, title, image, configStr]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/user-templates/:id', async (req, res) => {
    try {
      await db.execute('DELETE FROM user_templates WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Template overrides ---
  app.get('/api/template-overrides', async (req, res) => {
    try {
      const overrides = await db.queryAll('SELECT * FROM template_overrides');
      res.json(overrides.map((o) => JSON.parse(o.config)));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/template-overrides', async (req, res) => {
    const list = req.body;
    try {
      await db.withTransaction(async (tx) => {
        await tx.execute('DELETE FROM template_overrides');
        for (const item of list) {
          await tx.execute('INSERT INTO template_overrides (id, config) VALUES (?, ?)', [
            item.id,
            JSON.stringify(item),
          ]);
        }
      });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- System templates ---
  app.get('/api/system-templates', async (req, res) => {
    try {
      const templates = await db.queryAll('SELECT * FROM system_templates');
      res.json(
        templates.map((t) => ({
          id: t.id,
          title: t.title,
          category: t.category,
          image: t.image,
          config: JSON.parse(t.config),
        }))
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/system-templates', async (req, res) => {
    const { id, title, image, config } = req.body;
    try {
      const configStr = JSON.stringify(config);
      await db.execute(
        `INSERT INTO system_templates (id, title, image, config)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = EXCLUDED.title,
           image = EXCLUDED.image,
           config = EXCLUDED.config`,
        [id, title, image, configStr]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Datasets (upload only) ---
  app.get('/api/datasets', async (req, res) => {
    try {
      const includeContent = req.query.includeContent === 'true';
      const datasets = await db.queryAll('SELECT * FROM datasets ORDER BY updated_at DESC');
      res.json(
        datasets.map((d) =>
          formatDatasetRow(d, {
            includeContent: includeContent || (d.source_type || 'upload') === 'upload',
          })
        )
      );
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  if (!skipDatasetDetailRoutes) {
    app.get('/api/datasets/:id', async (req, res) => {
      const datasetId = req.params.id;
      const { includeMeta } = req.query;
      try {
        const dataset = await db.queryOne('SELECT * FROM datasets WHERE id = ?', [datasetId]);
        if (!dataset) {
          return res.status(404).json({ error: 'Dataset not found', requestedId: datasetId });
        }

        if (includeMeta === 'true') {
          res.json(formatDatasetRow(dataset, { includeContent: true }));
        } else {
          res.json(JSON.parse(dataset.content));
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  app.get('/api/debug/datasets', async (req, res) => {
    try {
      const rows = await db.queryAll('SELECT id, name, updated_at FROM datasets');
      res.json({ count: rows.length, datasets: rows });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  if (!skipDatasetDetailRoutes) {
    app.post('/api/datasets', async (req, res) => {
      if (!assertPayloadSize(req, res)) return;

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
      } = req.body;

      if (!id || !name || !content) {
        return res.status(400).json({ error: 'id, name, and content are required' });
      }

      if ((source_type || 'upload') !== 'upload') {
        return res.status(400).json({
          error: 'Connector-backed datasets are not available in core deployment mode.',
        });
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

        await db.execute(
          `INSERT INTO datasets (
            id, name, type, content, bi_config, source_type, connector_id,
            sql_query, table_ref, refresh_policy, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(id) DO UPDATE SET
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            content = EXCLUDED.content,
            bi_config = EXCLUDED.bi_config,
            source_type = EXCLUDED.source_type,
            connector_id = EXCLUDED.connector_id,
            sql_query = EXCLUDED.sql_query,
            table_ref = EXCLUDED.table_ref,
            refresh_policy = EXCLUDED.refresh_policy,
            updated_at = CURRENT_TIMESTAMP`,
          [
            id,
            name,
            type || 'json',
            contentStr,
            biConfigStr,
            'upload',
            connector_id || null,
            sql_query || null,
            table_ref ? (typeof table_ref === 'string' ? table_ref : JSON.stringify(table_ref)) : null,
            refresh_policy || 'manual',
          ]
        );
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  app.delete('/api/datasets/:id', async (req, res) => {
    try {
      await db.execute('DELETE FROM datasets WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- System settings ---
  app.get('/api/system-settings/:id', async (req, res) => {
    try {
      const setting = await db.queryOne('SELECT * FROM system_settings WHERE id = ?', [req.params.id]);
      if (!setting) return res.json(null);
      res.json(JSON.parse(setting.config));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/system-settings', async (req, res) => {
    const { id, config } = req.body;
    if (!id || !config) return res.status(400).json({ error: 'id and config are required' });
    try {
      const configStr = typeof config === 'string' ? config : JSON.stringify(config);
      await db.execute(
        `INSERT INTO system_settings (id, config, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           config = EXCLUDED.config,
           updated_at = CURRENT_TIMESTAMP`,
        [id, configStr]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // --- Private photos ---
  app.get('/api/private-photos', async (req, res) => {
    try {
      const photos = await db.queryAll('SELECT * FROM private_photos ORDER BY updated_at DESC');
      res.json(photos);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/private-photos', async (req, res) => {
    if (!assertPayloadSize(req, res)) return;

    const { id, name, content } = req.body;
    if (!id || !name || !content) {
      return res.status(400).json({ error: 'id, name and content are required' });
    }

    if (Buffer.byteLength(String(content), 'utf8') > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({
        error: 'Photo content exceeds 4 MB limit (Vercel serverless constraint).',
      });
    }

    try {
      await db.execute(
        `INSERT INTO private_photos (id, name, content, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET
           name = EXCLUDED.name,
           content = EXCLUDED.content,
           updated_at = CURRENT_TIMESTAMP`,
        [id, name, content]
      );
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete('/api/private-photos/:id', async (req, res) => {
    try {
      await db.execute('DELETE FROM private_photos WHERE id = ?', [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

module.exports = { mountCoreRoutes };
