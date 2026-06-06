const DISABLED_MESSAGE =
  'This API is not enabled in core deployment mode (TINIX_FEATURES=core). Set TINIX_FEATURES=full for local development with all features.';

function disabledHandler(req, res) {
  res.status(501).json({ error: DISABLED_MESSAGE, path: req.path });
}

function mountDisabledRoutes(app) {
  app.use('/api/auto-bi', disabledHandler);
  app.use('/api/agent/v1', disabledHandler);
  app.use('/api/embed', disabledHandler);
  app.use('/api/connectors', disabledHandler);

  app.post('/api/datasets/from-query', disabledHandler);
  app.post('/api/datasets/from-table', disabledHandler);
  app.post('/api/datasets/:id/refresh', disabledHandler);
}

module.exports = { mountDisabledRoutes };
