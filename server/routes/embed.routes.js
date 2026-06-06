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
  getEmbedAppByApiKey,
  parseBearerToken,
} = require('../embed.service');

function mountEmbedRoutes(app) {
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

  app.get('/api/embed/config', (req, res) => {
    res.json({ tokenTtlSeconds: TOKEN_TTL_SECONDS });
  });

  app.get('/api/embed/apps', async (req, res) => {
    try {
      res.json(await listEmbedApps());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/embed/apps', async (req, res) => {
    try {
      const { name, allowedOrigins } = req.body;
      const embedApp = await createEmbedApp({ name, allowedOrigins });
      res.json(embedApp);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/embed/apps/:id/rotate', async (req, res) => {
    try {
      const result = await rotateEmbedAppKey(req.params.id);
      res.json(result);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  app.put('/api/embed/apps/:id/origins', async (req, res) => {
    try {
      const result = await updateEmbedAppOrigins(req.params.id, req.body.allowedOrigins);
      res.json(result);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  app.post('/api/embed/token', async (req, res) => {
    try {
      const apiKey = req.headers['x-embed-api-key'];
      if (!apiKey) return res.status(401).json({ error: 'X-Embed-Api-Key header is required' });

      const embedApp = await getEmbedAppByApiKey(apiKey);
      if (!embedApp) return res.status(401).json({ error: 'Invalid embed API key' });

      const { dashboardId, user } = req.body;
      if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });

      const origin = req.headers.origin || req.headers.referer || null;
      const result = await mintEmbedToken({
        app: embedApp,
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

  app.get('/api/embed/dashboard/:id', async (req, res) => {
    try {
      const ctx = requireEmbedContext(req, res);
      if (!ctx) return;

      const dashboard = await getPublishedDashboard(req.params.id, ctx);
      res.json(dashboard);
    } catch (error) {
      const status = error.message.includes('not published') ? 403 : 404;
      res.status(status).json({ error: error.message });
    }
  });

  app.post('/api/embed/publish', async (req, res) => {
    try {
      const { dashboardId, embedSettings } = req.body;
      if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });
      const result = await publishDashboard(dashboardId, embedSettings || {});
      res.json(result);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  app.post('/api/embed/revoke', async (req, res) => {
    try {
      const { dashboardId } = req.body;
      if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });
      const result = await unpublishDashboard(dashboardId);
      res.json(result);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  });

  app.post('/api/embed/preview-token', async (req, res) => {
    try {
      const { dashboardId, user } = req.body;
      if (!dashboardId) return res.status(400).json({ error: 'dashboardId is required' });
      const result = await mintEmbedToken({
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
}

module.exports = { mountEmbedRoutes };
