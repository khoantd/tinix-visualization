/**
 * Feature mode: `core` (Vercel / Neon) or `full` (local SQLite + all APIs).
 */
function getFeatureMode() {
  if (process.env.TINIX_FEATURES === 'full') return 'full';
  if (process.env.TINIX_FEATURES === 'core') return 'core';
  return process.env.VERCEL ? 'core' : 'full';
}

function isCoreMode() {
  return getFeatureMode() === 'core';
}

module.exports = { getFeatureMode, isCoreMode };
