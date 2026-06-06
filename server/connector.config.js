const AUTH_TYPES = ['none', 'bearer', 'api_key', 'basic'];

const ENGINES = {
  postgres: {
    id: 'postgres',
    label: 'PostgreSQL',
    defaultPort: 5432,
    fields: ['host', 'port', 'database', 'username', 'password', 'ssl'],
  },
  mysql: {
    id: 'mysql',
    label: 'MySQL',
    defaultPort: 3306,
    fields: ['host', 'port', 'database', 'username', 'password', 'ssl'],
  },
  sqlite: {
    id: 'sqlite',
    label: 'SQLite',
    defaultPort: null,
    fields: ['filePath'],
  },
  graphql: {
    id: 'graphql',
    label: 'GraphQL',
    defaultPort: null,
    fields: ['endpoint', 'authType', 'authHeaderName', 'customHeaders', 'allowIntrospection'],
  },
};

const SUPPORTED_ENGINES = Object.keys(ENGINES);

function getEngine(engine) {
  const def = ENGINES[engine];
  if (!def) throw new Error(`Unsupported engine: ${engine}`);
  return def;
}

function validateEngine(engine) {
  if (!SUPPORTED_ENGINES.includes(engine)) {
    throw new Error(`Engine must be one of: ${SUPPORTED_ENGINES.join(', ')}`);
  }
}

function validateEndpointUrl(endpoint) {
  let parsed;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('endpoint must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('endpoint must use http or https');
  }
  return endpoint;
}

function sanitizeCustomHeaders(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  const blocked = new Set(['authorization', 'cookie', 'set-cookie']);
  for (const [key, value] of Object.entries(raw)) {
    const k = String(key).trim();
    if (!k || blocked.has(k.toLowerCase())) continue;
    out[k] = String(value);
  }
  return out;
}

function sanitizeConfigInput(body, engine) {
  validateEngine(engine);

  if (engine === 'sqlite') {
    const filePath = String(body.filePath || '').trim();
    if (!filePath) throw new Error('filePath is required for SQLite');
    return { filePath };
  }

  if (engine === 'graphql') {
    const endpoint = validateEndpointUrl(String(body.endpoint || '').trim());
    const authType = AUTH_TYPES.includes(body.authType) ? body.authType : 'none';
    const authHeaderName = String(body.authHeaderName || 'X-API-Key').trim() || 'X-API-Key';
    const allowIntrospection = body.allowIntrospection !== false;
    const basicUsername = authType === 'basic' ? String(body.basicUsername || '').trim() : '';
    const customHeaders = sanitizeCustomHeaders(body.customHeaders);

    if (authType === 'basic' && !basicUsername) {
      throw new Error('basicUsername is required for Basic auth');
    }

    return {
      endpoint,
      authType,
      authHeaderName,
      allowIntrospection,
      basicUsername,
      customHeaders,
    };
  }

  const def = getEngine(engine);
  const host = String(body.host || '').trim();
  const database = String(body.database || '').trim();
  const username = String(body.username || '').trim();
  const port = Number(body.port) || def.defaultPort;

  if (!host) throw new Error('host is required');
  if (!database) throw new Error('database is required');
  if (!username) throw new Error('username is required');

  return {
    host,
    port,
    database,
    username,
    ssl: Boolean(body.ssl),
  };
}

function getConnectionSummary(config, engine) {
  if (engine === 'sqlite') {
    return config.filePath || '—';
  }
  if (engine === 'graphql') {
    try {
      const url = new URL(config.endpoint || '');
      return `${url.hostname}${url.pathname !== '/' ? url.pathname : ''}`;
    } catch {
      return config.endpoint || '—';
    }
  }
  const host = config.host || '—';
  const port = config.port ? `:${config.port}` : '';
  const db = config.database ? `/${config.database}` : '';
  return `${host}${port}${db}`;
}

module.exports = {
  AUTH_TYPES,
  ENGINES,
  SUPPORTED_ENGINES,
  getEngine,
  validateEngine,
  sanitizeConfigInput,
  getConnectionSummary,
};
