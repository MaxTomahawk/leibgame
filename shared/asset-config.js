const PRODUCTION_ASSET_BASE = 'https://MaxTomahawk.github.io/leibgame-assets/assets/';

function isPrivateOrLocalHost (host) {
  if (!host || host === 'localhost' || host === '[::1]') return true;
  if (host.endsWith('.local')) return true;

  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;

  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT / Tailscale
  if (a === 127) return true;
  return false;
}

function isLocalDev () {
  return isPrivateOrLocalHost(window.location.hostname);
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
