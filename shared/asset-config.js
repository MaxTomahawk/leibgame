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
