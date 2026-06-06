const assert = require('assert');
const crypto = require('crypto');

process.env.EMBED_JWT_SECRET = 'test-embed-secret-min-32-characters-long';

const {
  signEmbedToken,
  verifyEmbedToken,
  isOriginAllowed,
  parseBearerToken,
} = require('../embed.service');

assert.strictEqual(typeof signEmbedToken, 'function');
assert.strictEqual(typeof verifyEmbedToken, 'function');

const payload = {
  sub: 'user-1',
  dashboardId: 'dash-1',
  appId: 'app-1',
  datasetIds: ['ds-1'],
  connectorIds: [],
};

const token = signEmbedToken(payload, 60);
assert.ok(typeof token === 'string' && token.split('.').length === 3);

const verified = verifyEmbedToken(token);
assert.strictEqual(verified.sub, 'user-1');
assert.strictEqual(verified.dashboardId, 'dash-1');

assert.throws(() => verifyEmbedToken('bad.token.here'), /Invalid embed token/);

assert.strictEqual(isOriginAllowed({ allowed_origins: [] }, 'https://a.com'), true);
assert.strictEqual(isOriginAllowed({ allowed_origins: ['https://a.com'] }, 'https://a.com'), true);
assert.strictEqual(isOriginAllowed({ allowed_origins: ['https://a.com'] }, 'https://b.com'), false);

assert.strictEqual(parseBearerToken('Bearer abc123'), 'abc123');
assert.strictEqual(parseBearerToken(null), null);

console.log('embed.service.test.js: all tests passed');
