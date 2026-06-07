/**
 * Platform game catalog and asset manifest helpers.
 * Games register here; manifest URLs point at leibgame-assets CDN.
 */

const PRODUCTION_MANIFEST_URL =
  'https://MaxTomahawk.github.io/leibgame-assets/assets/manifest.json';

/** @type {ReadonlyArray<{ id: string, title: string, subtitle: string, path: string, available: boolean, emoji: string }>} */
export const GAMES = [
  {
    id: 'clouds',
    title: 'Leib Clouds',
    subtitle: 'Multiplayer Cloud Jumper',
    path: 'games/clouds/',
    available: true,
    emoji: '☁️'
  },
  {
    id: 'jump',
    title: 'Leib Jump!',
    subtitle: 'Side-scrolling platformer — coming soon',
    path: 'games/jump/',
    available: false,
    emoji: '🦘'
  }
];

export function getAvailableGames () {
  return GAMES.filter((g) => g.available);
}

export function getGameById (id) {
  return GAMES.find((g) => g.id === id) ?? null;
}

/** @returns {string} */
export function getManifestUrl () {
  const params = new URLSearchParams(window.location.search);
  const override = params.get('manifest');
  if (override) return override;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return '/assets/manifest.json';
  }
  return PRODUCTION_MANIFEST_URL;
}

let cachedManifest = null;

export async function loadAssetManifest () {
  if (cachedManifest) return cachedManifest;
  try {
    const res = await fetch(getManifestUrl());
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    cachedManifest = await res.json();
    return cachedManifest;
  } catch (e) {
    console.warn('Asset manifest unavailable:', e);
    return null;
  }
}
