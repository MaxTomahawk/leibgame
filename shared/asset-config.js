const PRODUCTION_ASSET_BASE = 'https://MaxTomahawk.github.io/leibgame-assets/assets/';

function isLocalDev () {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

/** @returns {string} */
export function getAssetBaseUrl () {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('assets');
  if (override) {
    return override.endsWith('/') ? override : `${override}/`;
  }
  if (isLocalDev()) {
    return '/assets/';
  }
  return PRODUCTION_ASSET_BASE;
}

export const ASSET_BASE_URL = getAssetBaseUrl ();

/** Stable model key used in animation maps (not quality-specific). */
export function modelKeyFromPath (modelPath) {
  const file = modelPath.split('/').pop() || modelPath;
  return file.replace(/_(ultra|high|medium|low)\.glb$/i, '.glb');
}

/** Normalize any model reference to a bare filename (e.g. `leib.glb`). */
export function resolveModelKey (path) {
  if (!path) return 'leib.glb';
  return modelKeyFromPath(path);
}

/** Canonical appearance id used in multiplayer animation maps. */
export function appearanceModelId (modelKey) {
  return `${ASSET_BASE_URL}${resolveModelKey(modelKey)}`;
}

/** CDN/local URL for a given quality tier. */
export function modelUrlForQuality (modelKey, quality = 'high') {
  const name = resolveModelKey(modelKey).replace('.glb', '');
  return `${ASSET_BASE_URL}${name}_${quality}.glb`;
}
