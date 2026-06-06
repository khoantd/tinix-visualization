const assert = require('assert');

process.env.AGENT_JWT_SECRET = 'test-agent-secret-min-32-characters-long';

const {
  signAgentToken,
  verifyAgentToken,
  ALL_SCOPES,
  DEFAULT_SCOPES,
  assertScope,
  assertResourceAllowed,
  agentError,
  parseBearerToken,
} = require('../agent.service');

// normalizeScopes is not exported — test via ALL_SCOPES / DEFAULT_SCOPES
assert.ok(ALL_SCOPES.includes('auto_bi'));
assert.deepStrictEqual(DEFAULT_SCOPES, ['catalog:read', 'data:read']);

const payload = {
  sub: 'agent-user',
  appId: 'agent_app_1',
  scopes: ['catalog:read', 'data:read'],
  allowedResourceIds: null,
};

const token = signAgentToken(payload, 60);
assert.ok(typeof token === 'string' && token.split('.').length === 3);

const verified = verifyAgentToken(token);
assert.strictEqual(verified.sub, 'agent-user');
assert.strictEqual(verified.typ, 'agent');
assert.deepStrictEqual(verified.scopes, ['catalog:read', 'data:read']);

assert.throws(() => verifyAgentToken('invalid'), /Invalid agent token/);

const scopePayload = { scopes: ['catalog:read'] };
assert.doesNotThrow(() => assertScope(scopePayload, 'catalog:read'));
assert.throws(() => assertScope(scopePayload, 'dashboard:write'), /Missing required scope/);

const resourcePayload = {
  allowedResourceIds: { datasets: ['ds-1'] },
};
assert.doesNotThrow(() => assertResourceAllowed(resourcePayload, 'datasets', 'ds-1'));
assert.throws(() => assertResourceAllowed(resourcePayload, 'datasets', 'ds-2'), /Access denied/);

const err = agentError('TEST', 'message', 'field');
assert.strictEqual(err.error_code, 'TEST');
assert.strictEqual(err.message, 'message');
assert.strictEqual(err.field, 'field');

assert.strictEqual(parseBearerToken('Bearer tok'), 'tok');

console.log('agent.service.test.js: all tests passed');
