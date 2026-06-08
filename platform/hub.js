import { GAMES } from '../shared/asset-registry.js';
import { appUrl } from '../shared/base-path.js';

function renderGameTiles (container) {
  container.innerHTML = '';

  for (const game of GAMES) {
    const tile = document.createElement(game.available ? 'a' : 'div');
    tile.className = `game-tile block rounded-2xl p-6 border border-white/10 hub-card text-left ${
      game.available ? 'hover:border-indigo-400' : 'game-tile--disabled'
    }`;

    if (game.available) {
      tile.href = appUrl(game.path);
      tile.setAttribute('data-testid', `game-tile-${game.id}`);
    } else {
      tile.setAttribute('aria-disabled', 'true');
      tile.setAttribute('data-testid', `game-tile-${game.id}-coming-soon`);
    }

    tile.innerHTML = `
      <div class="text-4xl mb-3">${game.emoji}</div>
      <h2 class="text-xl font-bold text-white mb-1">${game.title}</h2>
      <p class="text-sm text-indigo-200/80">${game.subtitle}</p>
      ${
        game.available
          ? '<span class="inline-block mt-4 text-xs font-bold uppercase tracking-wide text-green-400">Play →</span>'
          : '<span class="inline-block mt-4 text-xs font-bold uppercase tracking-wide text-gray-400">Coming soon</span>'
      }
    `;

    container.appendChild(tile);
  }
}

function loadVersion () {
  const el = document.getElementById('hub-version');
  if (!el) return;

  fetch('version.json')
    .then((r) => r.json())
    .then((v) => {
      el.textContent = `v${v.commit}`;
    })
    .catch(() => {
      el.textContent = 'dev';
    });
}

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('game-grid');
  if (grid) renderGameTiles(grid);
  loadVersion();
});
