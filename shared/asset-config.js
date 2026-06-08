/**
 * Asset URL routing — local junction, bundled low tier on Pages, CDN for higher tiers.
 */

import { getBasePath } from './base-path.js';

const PRODUCTION_CDN_BASE = 'https://MaxTomahawk.github.io/leibgame-assets/assets/';

function bundledAssetBase () {
  return `${getBasePath()}assets/`;
}

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

export function isLocalDev () {
  return isPrivateOrLocalHost(window.location.hostname);
}

/** Full local mirror via junction/symlink (dev + Tailscale/LAN). */
export function getLocalAssetBaseUrl () {
  return '/assets/';
}

/** CDN base for shipped assets (prod + default remote). */
export function getCdnAssetBaseUrl () {
  return PRODUCTION_CDN_BASE;
}

/** @returns {string} */
export function getAssetBaseUrl () {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('assets');
  if (override) {
    return override.endsWith('/') ? override : `${override}/`;
  }
  if (isLocalDev()) {
    return getLocalAssetBaseUrl();
  }
  return getCdnAssetBaseUrl();
}

export const ASSET_BASE_URL = getAssetBaseUrl();

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

/**
 * URL for a GLB quality tier.
 * Local/Tailscale: all tiers from junctioned /assets/.
 * GitHub Pages: low tier from bundled /assets/ in leibgame repo; others from CDN.
 */
export function modelUrlForQuality (modelKey, quality = 'high') {
  const name = resolveModelKey(modelKey).replace('.glb', '');
  const file = `${name}_${quality}.glb`;
  if (isLocalDev()) {
    return `${getLocalAssetBaseUrl()}${file}`;
  }
  if (quality === 'low') {
    return `${bundledAssetBase()}${file}`;
  }
  return `${getCdnAssetBaseUrl()}${file}`;
}

/**
 * Remote asset path (audio, textures, world GLBs on high+).
 * Uses local /assets/ on private networks; CDN on GitHub Pages.
 */
export function remoteAssetUrl (relativePath) {
  const clean = relativePath.replace(/^\//, '');
  if (isLocalDev()) {
    return `${getLocalAssetBaseUrl()}${clean}`;
  }
  if (clean.endsWith('_low.glb')) {
    return `${bundledAssetBase()}${clean}`;
  }
  return `${getCdnAssetBaseUrl()}${clean}`;
}
