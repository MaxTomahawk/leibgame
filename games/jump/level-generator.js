/**
 * Procedural level generator for Leib Jump!
 * Generates side-scrolling platform layouts that are always completable
 * within the player's jump physics, with difficulty-scaled rewards.
 */

export const PHYSICS = {
    GRAVITY: 26,
    JUMP_VELOCITY: 11,
    RUN_SPEED: 7.5,
    SPRINT_SPEED: 10,
    PLAYER_HEIGHT: 1.8,
    PLAYER_WIDTH: 0.6,
};

// Derived reach limits (with safety margin baked in)
const MAX_JUMP_HEIGHT = (PHYSICS.JUMP_VELOCITY ** 2) / (2 * PHYSICS.GRAVITY);
const AIR_TIME = (2 * PHYSICS.JUMP_VELOCITY) / PHYSICS.GRAVITY;
const MAX_JUMP_DIST = PHYSICS.RUN_SPEED * AIR_TIME;

export const DIFFICULTY = {
    easy: {
        label: 'Easy',
        segments: 12,
        gapFactor: 0.45,
        heightFactor: 0.5,
        coinMultiplier: 1,
        starChance: 0.08,
        enemyChance: 0.05,
        rewardMultiplier: 1,
        color: 0x5cb85c,
    },
    normal: {
        label: 'Normal',
        segments: 18,
        gapFactor: 0.65,
        heightFactor: 0.7,
        coinMultiplier: 1.5,
        starChance: 0.15,
        enemyChance: 0.15,
        rewardMultiplier: 2,
        color: 0xf0ad4e,
    },
    hard: {
        label: 'Hard',
        segments: 24,
        gapFactor: 0.85,
        heightFactor: 0.9,
        coinMultiplier: 2.5,
        starChance: 0.28,
        enemyChance: 0.3,
        rewardMultiplier: 4,
        color: 0xd9534f,
    },
};

function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

/**
 * @param {'easy'|'normal'|'hard'} difficulty
 * @param {number} [seed] - optional seed for reproducible levels
 */
export function generateLevel(difficulty = 'normal', seed = Date.now()) {
    const config = DIFFICULTY[difficulty] || DIFFICULTY.normal;
    const rng = seededRandom(seed);

    const safeMaxGap = MAX_JUMP_DIST * config.gapFactor;
    const safeMaxHeight = MAX_JUMP_HEIGHT * config.heightFactor;

    const platforms = [];
    const coins = [];
    const stars = [];
    const enemies = [];

    // Starting ground platform
    let currentRight = 0;
    let currentY = 1;
    let currentWidth = 6;

    platforms.push({
        x: -3,
        y: 0,
        w: 6,
        h: 1,
        type: 'ground',
    });

    currentRight = 3;

    for (let i = 0; i < config.segments; i++) {
        let placed = false;
        let attempts = 0;

        while (!placed && attempts < 20) {
            attempts++;
            const gap = 1 + rng() * safeMaxGap;
            const dy = (rng() * 2 - 1) * safeMaxHeight;
            const newWidth = 2.5 + rng() * 3.5;
            const newY = clamp(currentY + dy, 0.5, 8);
            const newLeft = currentRight + gap;
            const heightDelta = Math.abs(newY - currentY);

            // Verify vertical reachability
            if (heightDelta > safeMaxHeight) continue;

            // Verify horizontal reachability (edge to edge)
            if (gap > safeMaxGap) continue;

            platforms.push({
                x: newLeft,
                y: newY - 0.5,
                w: newWidth,
                h: 1,
                type: 'platform',
            });

            // Coins along the platform
            const coinCount = Math.max(1, Math.floor((1 + rng() * 3) * config.coinMultiplier));
            for (let c = 0; c < coinCount; c++) {
                const t = (c + 1) / (coinCount + 1);
                coins.push({
                    x: newLeft + newWidth * t,
                    y: newY + 0.8,
                    value: Math.ceil(config.rewardMultiplier),
                });
            }

            // Floating star (bonus reward on harder levels)
            if (rng() < config.starChance) {
                stars.push({
                    x: newLeft + newWidth * 0.5,
                    y: newY + 2 + rng() * safeMaxHeight * 0.5,
                    value: Math.ceil(3 * config.rewardMultiplier),
                });
            }

            // Enemy patrolling the platform
            if (newWidth > 3 && rng() < config.enemyChance) {
                enemies.push({
                    x: newLeft + newWidth * 0.5,
                    y: newY,
                    patrolMin: newLeft + 0.5,
                    patrolMax: newLeft + newWidth - 0.5,
                    speed: 1.5 + rng() * 2 * (difficulty === 'hard' ? 1.5 : 1),
                    direction: rng() > 0.5 ? 1 : -1,
                });
            }

            currentRight = newLeft + newWidth;
            currentY = newY;
            currentWidth = newWidth;
            placed = true;
        }

        // Fallback: place a close easy platform if generation failed
        if (!placed) {
            const newWidth = 4;
            const newLeft = currentRight + 2;
            platforms.push({ x: newLeft, y: currentY - 0.5, w: newWidth, h: 1, type: 'platform' });
            currentRight = newLeft + newWidth;
        }
    }

    // Goal platform and flag
    const goalGap = Math.min(3, safeMaxGap);
    const goalX = currentRight + goalGap;
    platforms.push({
        x: goalX,
        y: currentY - 0.5,
        w: 4,
        h: 1,
        type: 'goal',
    });

    return {
        seed,
        difficulty,
        config,
        platforms,
        coins,
        stars,
        enemies,
        goalX: goalX + 2,
        goalY: currentY,
        spawnX: 0,
        spawnY: 2,
        worldWidth: goalX + 10,
        rewardMultiplier: config.rewardMultiplier,
    };
}

export function getReachMetrics() {
    return {
        maxJumpHeight: MAX_JUMP_HEIGHT,
        maxJumpDistance: MAX_JUMP_DIST,
        airTime: AIR_TIME,
    };
}
