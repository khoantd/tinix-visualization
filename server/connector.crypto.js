const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

const SECRET_FIELD_MAP = {
  password: 'password_enc',
  token: 'token_enc',
  apiKey: 'api_key_enc',
  basicPassword: 'basic_password_enc',
};

function getSecretKey() {
  const secret = process.env.CONNECTOR_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      'CONNECTOR_SECRET must be set in .env (min 16 characters) to store connector secrets.'
    );
  }
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptPassword(plain) {
  if (!plain) return null;
  const key = getSecretKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptPassword(encrypted) {
  if (!encrypted) return '';
  const key = getSecretKey();
  const [ivB64, tagB64, dataB64] = encrypted.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid encrypted secret format');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function mergeConfigWithSecrets(config, secrets = {}, existingConfig = {}) {
  const merged = { ...config };

  for (const [plainKey, encKey] of Object.entries(SECRET_FIELD_MAP)) {
    const value = secrets[plainKey];
    if (value !== undefined && value !== null && value !== '') {
      merged[encKey] = encryptPassword(value);
    } else if (existingConfig[encKey]) {
      merged[encKey] = existingConfig[encKey];
    }
    delete merged[plainKey];
  }

  delete merged.password;
  delete merged.token;
  delete merged.apiKey;
  delete merged.basicPassword;

  return merged;
}

function mergeConfigWithPassword(config, password, existingEnc = null) {
  return mergeConfigWithSecrets(
    config,
    { password },
    existingEnc ? { password_enc: existingEnc } : {}
  );
}

function stripSecrets(config) {
  if (!config) return {};
  const {
    password_enc,
    token_enc,
    api_key_enc,
    basic_password_enc,
    password,
    token,
    apiKey,
    basicPassword,
    ...safe
  } = config;
  return {
    ...safe,
    passwordSet: Boolean(password_enc),
    tokenSet: Boolean(token_enc),
    apiKeySet: Boolean(api_key_enc),
    basicPasswordSet: Boolean(basic_password_enc),
  };
}

module.exports = {
  encryptPassword,
  decryptPassword,
  mergeConfigWithPassword,
  mergeConfigWithSecrets,
  stripSecrets,
  decryptSecret: decryptPassword,
};
