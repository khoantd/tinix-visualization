const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const { getFeatureMode } = require('./config/features');
const { ensureSchema, getDatabaseUrl } = require('./db/index');
const { mountCoreRoutes } = require('./routes/core.routes');

const app = express();
const featureMode = getFeatureMode();
const useNeon = Boolean(getDatabaseUrl());
const bodyLimit = featureMode === 'core' || process.env.VERCEL ? '4mb' : '50mb';

const CORE_MODULES = ['core'];
const FULL_MODULES = ['core', 'auto-bi', 'connectors', 'embed', 'agent'];

app.use(cors());
app.use(bodyParser.json({ limit: bodyLimit }));
app.use(bodyParser.urlencoded({ limit: bodyLimit, extended: true }));

app.get('/api/health', async (req, res) => {
  try {
    if (useNeon) {
      await ensureSchema();
      const modules = featureMode === 'full' ? FULL_MODULES : CORE_MODULES;
      res.json({
        status: 'ok',
        features: featureMode,
        database: 'neon',
        modules,
      });
    } else if (featureMode === 'full') {
      res.json({
        status: 'ok',
        features: 'full',
        database: 'sqlite',
        modules: FULL_MODULES,
      });
    } else {
      res.json({
        status: 'ok',
        features: 'core',
        database: 'sqlite',
        modules: CORE_MODULES,
      });
    }
  } catch (error) {
    res.status(503).json({ status: 'error', error: error.message });
  }
});

if (useNeon) {
  app.use(async (req, res, next) => {
    if (req.path === '/api/health') return next();
    try {
      await ensureSchema();
      next();
    } catch (error) {
      res.status(503).json({ error: error.message });
    }
  });

  if (featureMode === 'full') {
    const { mountDatasetExtensionRoutes } = require('./routes/dataset.routes');
    const { mountAutoBiRoutes, resolveAutoBiProvider } = require('./routes/auto-bi.routes');
    const { mountConnectorRoutes } = require('./routes/connector.routes');
    const { mountEmbedRoutes } = require('./routes/embed.routes');
    const { createAgentRouter } = require('./agent.routes');

    mountCoreRoutes(app, { skipDatasetDetailRoutes: true });
    mountDatasetExtensionRoutes(app);
    mountAutoBiRoutes(app);
    mountConnectorRoutes(app);
    mountEmbedRoutes(app);
    app.use('/api/agent/v1', createAgentRouter({ resolveAutoBiProvider }));
    app.use('/docs/openapi', express.static(path.resolve(__dirname, '../docs/openapi')));
  } else {
    const { mountDisabledRoutes } = require('./routes/disabled.routes');
    mountCoreRoutes(app);
    mountDisabledRoutes(app);
  }
} else {
  const { mountFullRoutes } = require('./routes/full.routes');
  mountFullRoutes(app);
}

module.exports = app;
