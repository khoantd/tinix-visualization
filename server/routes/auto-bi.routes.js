const db = require('../db/index');
const { analyzeDatasetSchema, suggestCharts } = require('../ai.service');
const { buildDashboardFromSuggestions } = require('../dashboard.builder');
const {
  resolveProvider,
  getAvailableProviders,
  getDefaultProviderId,
} = require('../ai.config');

async function getAiSetting() {
  try {
    const row = await db.queryOne('SELECT config FROM system_settings WHERE id = ?', ['ai_setting']);
    return row ? JSON.parse(row.config) : null;
  } catch {
    return null;
  }
}

function resolveAutoBiProvider(requestProvider) {
  return getAiSetting().then((saved) => {
    const resolved = resolveProvider(requestProvider, saved?.activeProvider);
    if (!resolved) {
      throw new Error(
        'Chưa cấu hình AI provider. Sao chép .env.example thành .env và điền OPENROUTER_API_KEY hoặc LITELLM_BASE_URL.'
      );
    }
    return resolved;
  });
}

function mountAutoBiRoutes(app) {
  app.get('/api/auto-bi/providers', async (req, res) => {
    try {
      const saved = await getAiSetting();
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
      const resolvedProvider = await resolveAutoBiProvider(provider);
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
      const resolvedProvider = await resolveAutoBiProvider(provider);
      const suggestions = await suggestCharts(confirmedSchema, resolvedProvider);
      res.json(suggestions);
    } catch (err) {
      const status = err.message.includes('Chưa cấu hình') ? 400 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  app.post('/api/auto-bi/generate', async (req, res) => {
    try {
      const {
        datasetId,
        datasetName,
        datasetContent,
        projectName,
        theme,
        charts,
        executiveSummary,
      } = req.body;

      if (!datasetId) return res.status(400).json({ error: 'datasetId is required' });
      if (!charts?.length) return res.status(400).json({ error: 'charts is required' });

      const { projectConfig, projectId } = buildDashboardFromSuggestions({
        datasetId,
        datasetName,
        datasetContent,
        charts,
        executiveSummary,
        theme,
        projectName,
      });

      const configStr = JSON.stringify(projectConfig);
      await db.execute(
        `INSERT INTO projects (id, config, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(id) DO UPDATE SET config = excluded.config, updated_at = CURRENT_TIMESTAMP`,
        [projectId, configStr]
      );

      res.json({
        success: true,
        dashboardId: projectId,
        project: projectConfig,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
}

module.exports = { mountAutoBiRoutes, resolveAutoBiProvider, getAiSetting };
