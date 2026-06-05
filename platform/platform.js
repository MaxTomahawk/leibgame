import { assetRegistry } from '../shared/asset-registry.js';

const GAMES = [
    {
        id: 'clouds',
        title: 'Leib Clouds',
        description: 'Jump across procedurally generated cloud platforms to reach King Willem\'s castle. Collect stars, battle enemies, and visit Ronnie\'s shop.',
        href: 'games/clouds/index.html',
        emoji: '☁️',
        bannerClass: 'banner-clouds',
        tag: '3D Platformer',
    },
    {
        id: 'jump',
        title: 'Leib Jump!',
        description: 'A side-scrolling platformer inspired by New Super Mario Bros. Procedurally generated levels with scaling difficulty and bigger rewards on hard mode.',
        href: 'games/jump/index.html',
        emoji: '🍄',
        bannerClass: 'banner-jump',
        tag: '2D Platformer',
    },
];

async function initPlatform() {
    const grid = document.getElementById('game-grid');
    const statusEl = document.getElementById('asset-status');

    grid.innerHTML = GAMES.map(game => `
        <a href="${game.href}" class="game-card-link">
            <div class="game-card-banner ${game.bannerClass}">${game.emoji}</div>
            <div class="game-card-body">
                <span class="game-tag">${game.tag}</span>
                <h2>${game.title}</h2>
                <p>${game.description}</p>
            </div>
        </a>
    `).join('');

    try {
        await assetRegistry.load();
        const players = assetRegistry.getSelectablePlayers();
        const props = assetRegistry.getModels('prop');
        const enemies = assetRegistry.getModels('enemy');
        statusEl.innerHTML = `Asset library: ${players.length} playable characters, ${props.length} props, ${enemies.length} enemies — loaded dynamically from manifest`;
    } catch (err) {
        statusEl.textContent = 'Asset library: using offline fallback';
        console.warn(err);
    }
}

initPlatform();
