const PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'litellm', label: 'LiteLLM Proxy' },
];

const PLACEHOLDER_KEYS = new Set(['YOUR_API_KEY_HERE', 'YOUR_LITELLM_KEY_HERE', '']);

function isValidKey(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && !PLACEHOLDER_KEYS.has(trimmed);
}

function normalizeLiteLLMBaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let base = rawUrl.trim().replace(/\/+$/, '');
  if (!base) return null;
  if (!/^https?:\/\//i.test(base)) return null;
  if (!base.endsWith('/v1')) {
    base = `${base}/v1`;
  }
  return `${base}/chat/completions`;
}

function getOpenRouterConfig() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!isValidKey(apiKey)) return null;
  return {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      'Content-Type': 'application/json',
    },
    model: process.env.OPENROUTER_MODEL || 'qwen/qwen-3-coder-next',
  };
}

function getLiteLLMConfig() {
  const baseUrl = process.env.LITELLM_BASE_URL;
  const url = normalizeLiteLLMBaseUrl(baseUrl);
  if (!url) return null;

  const apiKey = process.env.LITELLM_API_KEY;
  const headers = { 'Content-Type': 'application/json' };
  if (isValidKey(apiKey)) {
    headers.Authorization = `Bearer ${apiKey.trim()}`;
  }

  return {
    url,
    headers,
    model: process.env.LITELLM_MODEL || 'gpt-4o-mini',
  };
}

function getProviderConfig(id) {
  switch (id) {
    case 'openrouter':
      return getOpenRouterConfig();
    case 'litellm':
      return getLiteLLMConfig();
    default:
      return null;
  }
}

function isProviderConfigured(id) {
  return getProviderConfig(id) !== null;
}

function getConfiguredProviderIds() {
  return PROVIDERS.filter(p => isProviderConfigured(p.id)).map(p => p.id);
}

function getDefaultProviderId() {
  const envDefault = process.env.AI_PROVIDER;
  if (envDefault && isProviderConfigured(envDefault)) {
    return envDefault;
  }
  const configured = getConfiguredProviderIds();
  return configured[0] || null;
}

/**
 * Resolve provider with priority: preferredId → savedSetting → AI_PROVIDER env → first configured
 */
function resolveProvider(preferredId, savedActiveProvider) {
  const candidates = [preferredId, savedActiveProvider, process.env.AI_PROVIDER].filter(Boolean);

  for (const id of candidates) {
    if (PROVIDERS.some(p => p.id === id) && isProviderConfigured(id)) {
      return id;
    }
  }

  return getDefaultProviderId();
}

function getAvailableProviders() {
  return PROVIDERS.map(p => {
    const config = getProviderConfig(p.id);
    return {
      id: p.id,
      label: p.label,
      configured: config !== null,
      model: config ? config.model : null,
    };
  });
}

function assertProviderConfigured(providerId) {
  const resolved = providerId || getDefaultProviderId();
  if (!resolved || !isProviderConfigured(resolved)) {
    throw new Error(
      'Chưa cấu hình AI provider. Sao chép .env.example thành .env và điền OPENROUTER_API_KEY hoặc LITELLM_BASE_URL.'
    );
  }
  return resolved;
}

module.exports = {
  PROVIDERS,
  isProviderConfigured,
  getProviderConfig,
  getConfiguredProviderIds,
  getDefaultProviderId,
  resolveProvider,
  getAvailableProviders,
  assertProviderConfigured,
};
