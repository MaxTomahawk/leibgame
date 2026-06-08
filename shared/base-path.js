/**
 * Resolve app root for GitHub Pages project sites (/leibgame/) vs local dev (/).
 */

/** @returns {string} Always ends with `/` — e.g. `/`, `/leibgame/` */
export function getBasePath () {
  if (typeof window === 'undefined') return '/';

  const { hostname, pathname } = window.location;

  if (hostname.endsWith('.github.io')) {
    const segment = pathname.split('/').filter(Boolean)[0];
    // Project site: first path segment is the repo name (not a game route).
    if (segment && segment !== 'games') {
      return `/${segment}/`;
    }
  }

  return '/';
}

/** Build a same-origin app URL from a repo-relative path (no leading slash required). */
export function appUrl (relativePath = '') {
  const clean = String(relativePath).replace(/^\/+/, '');
  return `${getBasePath()}${clean}`;
}
