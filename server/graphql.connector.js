const { parse, visit, Kind } = require('graphql');
const { decryptSecret } = require('./connector.crypto');

const QUERY_TIMEOUT_MS = 30000;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;
const MAX_QUERY_DEPTH = 10;

const INTROSPECTION_QUERY = `
  query IntrospectionQuery {
    __schema {
      queryType { name }
      types {
        kind
        name
        fields(includeDeprecated: true) {
          name
          args { name type { kind name ofType { kind name ofType { kind name } } } }
          type { kind name ofType { kind name ofType { kind name ofType { kind name } } } }
        }
      }
    }
  }
`;

function resolveGraphQLConfig(config) {
  const parsed = typeof config === 'string' ? JSON.parse(config) : { ...config };
  return {
    ...parsed,
    token: parsed.token_enc ? decryptSecret(parsed.token_enc) : '',
    apiKey: parsed.api_key_enc ? decryptSecret(parsed.api_key_enc) : '',
    basicPassword: parsed.basic_password_enc ? decryptSecret(parsed.basic_password_enc) : '',
  };
}

function buildAuthHeaders(config) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };

  if (config.customHeaders && typeof config.customHeaders === 'object') {
    for (const [key, value] of Object.entries(config.customHeaders)) {
      const lower = key.toLowerCase();
      if (lower === 'authorization' || lower === 'content-type' || lower === 'accept') continue;
      headers[key] = String(value);
    }
  }

  if (config.authType === 'bearer' && config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  } else if (config.authType === 'api_key' && config.apiKey) {
    headers[config.authHeaderName || 'X-API-Key'] = config.apiKey;
  } else if (config.authType === 'basic' && config.basicUsername) {
    const encoded = Buffer.from(`${config.basicUsername}:${config.basicPassword || ''}`).toString('base64');
    headers.Authorization = `Basic ${encoded}`;
  }

  return headers;
}

async function withTimeout(promise, ms = QUERY_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('GraphQL request timed out')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function formatGraphQLErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return 'GraphQL request failed';
  return errors
    .map((err) => {
      const path = err.path ? ` (path: ${err.path.join('.')})` : '';
      return `${err.message}${path}`;
    })
    .join('; ');
}

async function graphqlRequest(config, body, { allowErrors = false } = {}) {
  const resolved = resolveGraphQLConfig(config);
  const headers = buildAuthHeaders(resolved);

  const response = await withTimeout(
    fetch(resolved.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  );

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response from GraphQL endpoint (${response.status})`);
  }

  if (!response.ok && !payload.errors) {
    throw new Error(`GraphQL HTTP ${response.status}: ${text.slice(0, 200)}`);
  }

  if (payload.errors?.length && !allowErrors) {
    const err = new Error(formatGraphQLErrors(payload.errors));
    err.graphqlErrors = payload.errors;
    throw err;
  }

  return payload;
}

function getNamedType(typeRef) {
  let current = typeRef;
  while (current && (current.kind === 'NON_NULL' || current.kind === 'LIST')) {
    current = current.ofType;
  }
  return current;
}

function formatTypeName(typeRef) {
  if (!typeRef) return 'Unknown';
  let current = typeRef;
  let suffix = '';
  while (current) {
    if (current.kind === 'NON_NULL') {
      suffix = '!' + suffix;
      current = current.ofType;
    } else if (current.kind === 'LIST') {
      suffix = `[${suffix}]`;
      current = current.ofType;
    } else {
      return `${current.name || 'Unknown'}${suffix}`;
    }
  }
  return `Unknown${suffix}`;
}

function measureQueryDepth(ast) {
  let maxDepth = 0;
  visit(ast, {
    Field(_node, _key, _parent, path) {
      const depth = path.filter((p) => p && p.kind === Kind.FIELD).length;
      if (depth > maxDepth) maxDepth = depth;
    },
  });
  return maxDepth;
}

function assertReadOnlyQuery(document) {
  if (!document || typeof document !== 'string') {
    throw new Error('GraphQL query is required');
  }
  const trimmed = document.trim();
  if (!trimmed) throw new Error('GraphQL query is empty');

  let ast;
  try {
    ast = parse(trimmed);
  } catch (err) {
    throw new Error(`Invalid GraphQL syntax: ${err.message}`);
  }

  const operations = [];
  visit(ast, {
    OperationDefinition(node) {
      operations.push(node);
    },
  });

  if (operations.length === 0) {
    throw new Error('GraphQL document must contain a query operation');
  }
  if (operations.length > 1) {
    const unnamed = operations.filter((op) => !op.name);
    if (unnamed.length > 0) {
      throw new Error('Multiple operations require named operations');
    }
  }

  for (const op of operations) {
    if (op.operation !== 'query') {
      throw new Error(`Forbidden operation type: ${op.operation}. Only queries are allowed.`);
    }
  }

  const depth = measureQueryDepth(ast);
  if (depth > MAX_QUERY_DEPTH) {
    throw new Error(`Query exceeds maximum depth of ${MAX_QUERY_DEPTH}`);
  }

  return trimmed;
}

async function introspect(config) {
  const resolved = resolveGraphQLConfig(config);
  if (resolved.allowIntrospection === false) {
    throw new Error('Introspection is disabled for this connector');
  }
  const payload = await graphqlRequest(resolved, { query: INTROSPECTION_QUERY });
  return payload.data.__schema;
}

function getSchemaTypes(schema) {
  const map = new Map();
  for (const type of schema.types || []) {
    if (type.name && !type.name.startsWith('__')) {
      map.set(type.name, type);
    }
  }
  return map;
}

function flattenGraphQLData(data, rootField, limit = DEFAULT_LIMIT) {
  if (!data || typeof data !== 'object') {
    return { rows: [], rootField: null };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  if (rootField && data[rootField] !== undefined) {
    const value = data[rootField];
    const rows = normalizeToRows(value).slice(0, safeLimit);
    return { rows, rootField };
  }

  const keys = Object.keys(data).filter((k) => !k.startsWith('__'));
  if (keys.length === 1) {
    const key = keys[0];
    const rows = normalizeToRows(data[key]).slice(0, safeLimit);
    return { rows, rootField: key };
  }

  for (const key of keys) {
    const value = data[key];
    if (Array.isArray(value)) {
      return { rows: value.map(normalizeRow).slice(0, safeLimit), rootField: key };
    }
  }

  return { rows: [normalizeRow(data)], rootField: keys[0] || null };
}

function normalizeToRows(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeRow);
  }
  if (value && typeof value === 'object') {
    return [normalizeRow(value)];
  }
  return [{ value }];
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return { value: row };
  }
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) {
      out[k] = v.toISOString();
    } else if (v && typeof v === 'object') {
      out[k] = JSON.stringify(v);
    } else if (typeof v === 'bigint') {
      out[k] = v.toString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function testConnection(config) {
  const resolved = resolveGraphQLConfig(config);
  await graphqlRequest(resolved, { query: '{ __typename }' });
  return { ok: true, message: 'Connection successful' };
}

async function listSchemas() {
  return ['Query'];
}

async function listTables(config) {
  const schema = await introspect(config);
  const types = getSchemaTypes(schema);
  const queryTypeName = schema.queryType?.name || 'Query';
  const queryType = types.get(queryTypeName);
  if (!queryType?.fields) return [];

  return queryType.fields.map((field) => {
    const named = getNamedType(field.type);
    return {
      name: field.name,
      type: formatTypeName(field.type),
      returnKind: named?.kind || 'UNKNOWN',
    };
  });
}

async function listColumns(config, _schema, fieldName) {
  if (!fieldName) throw new Error('fieldName is required');
  const schemaData = await introspect(config);
  const types = getSchemaTypes(schemaData);
  const queryTypeName = schemaData.queryType?.name || 'Query';
  const queryType = types.get(queryTypeName);
  const field = queryType?.fields?.find((f) => f.name === fieldName);
  if (!field) throw new Error(`Query field not found: ${fieldName}`);

  const named = getNamedType(field.type);
  if (!named || (named.kind !== 'OBJECT' && named.kind !== 'INTERFACE')) {
    return [];
  }

  const objectType = types.get(named.name);
  if (!objectType?.fields) return [];

  return objectType.fields.map((col) => ({
    name: col.name,
    type: formatTypeName(col.type),
    nullable: col.type?.kind !== 'NON_NULL',
  }));
}

async function runGraphQLQuery(config, query, variables = {}, limit = DEFAULT_LIMIT, rootField = null) {
  const safeQuery = assertReadOnlyQuery(query);
  const resolved = resolveGraphQLConfig(config);
  const start = Date.now();

  let parsedVariables = variables;
  if (typeof variables === 'string') {
    try {
      parsedVariables = variables.trim() ? JSON.parse(variables) : {};
    } catch {
      throw new Error('variables must be valid JSON');
    }
  }

  const payload = await graphqlRequest(resolved, {
    query: safeQuery,
    variables: parsedVariables,
  });

  const { rows, rootField: detectedRoot } = flattenGraphQLData(payload.data, rootField, limit);

  return {
    rows,
    rowCount: rows.length,
    durationMs: Date.now() - start,
    query: safeQuery,
    rootField: rootField || detectedRoot,
    graphqlErrors: payload.errors || null,
  };
}

function buildFieldQuery(fieldName, columns) {
  const colNames = columns?.length
    ? columns.slice(0, 8).map((c) => c.name).join('\n    ')
    : 'id';
  const opName = `Get${fieldName.charAt(0).toUpperCase()}${fieldName.slice(1)}`;
  return `query ${opName} {\n  ${fieldName} {\n    ${colNames}\n  }\n}`;
}

module.exports = {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  MAX_QUERY_DEPTH,
  testConnection,
  listSchemas,
  listTables,
  listColumns,
  runGraphQLQuery,
  assertReadOnlyQuery,
  flattenGraphQLData,
  buildFieldQuery,
  introspect,
};
