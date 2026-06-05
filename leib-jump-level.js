export const JUMP_DIFFICULTIES = {
    easy: {
        label: 'Easy',
        platformCount: 16,
        rewardMultiplier: 1,
        completionBonus: 8,
        enemyChance: 0.08,
        minWidth: 4.8,
        maxGap: 4.6,
        maxRise: 1.6
    },
    normal: {
        label: 'Normal',
        platformCount: 22,
        rewardMultiplier: 2,
        completionBonus: 18,
        enemyChance: 0.16,
        minWidth: 3.8,
        maxGap: 5.4,
        maxRise: 2.2
    },
    hard: {
        label: 'Hard',
        platformCount: 30,
        rewardMultiplier: 4,
        completionBonus: 42,
        enemyChance: 0.26,
        minWidth: 3.0,
        maxGap: 6.2,
        maxRise: 2.8
    }
};

const MAX_SAFE_GAP = 6.5;
const MAX_SAFE_RISE = 3.0;
const MIN_FALL_RECOVERY_WIDTH = 3.0;

export function generateLeibJumpLevel(difficultyKey = 'normal', seed = Date.now()) {
    const difficulty = JUMP_DIFFICULTIES[difficultyKey] || JUMP_DIFFICULTIES.normal;
    const random = mulberry32(hashSeed(seed));
    const platforms = [];
    const coins = [];
    const enemies = [];

    let x = 0;
    let y = 0;

    platforms.push({ x, y, w: 9, h: 1.1, checkpoint: true });

    for (let i = 1; i < difficulty.platformCount; i++) {
        const gap = 2.5 + random() * (difficulty.maxGap - 2.5);
        const previous = platforms[platforms.length - 1];
        const width = difficulty.minWidth + random() * 2.8;
        const rise = (random() - 0.48) * difficulty.maxRise * 2;
        y = clamp(previous.y + rise, -2.2, 5.2);
        x = previous.x + previous.w / 2 + gap + width / 2;

        const platform = { x, y, w: width, h: 1 };
        platforms.push(platform);

        const coinCount = 1 + Math.floor(random() * (difficulty.rewardMultiplier + 2));
        for (let c = 0; c < coinCount; c++) {
            const coinX = x - width * 0.3 + (width * 0.6) * (coinCount === 1 ? 0.5 : c / (coinCount - 1));
            coins.push({
                x: coinX,
                y: y + 1.8 + Math.sin(c) * 0.2,
                value: difficulty.rewardMultiplier
            });
        }

        if (i > 2 && i < difficulty.platformCount - 2 && random() < difficulty.enemyChance) {
            enemies.push({
                x: x + (random() - 0.5) * width * 0.45,
                y: y + 1.1,
                patrol: Math.max(1.5, width * 0.35)
            });
        }
    }

    const last = platforms[platforms.length - 1];
    const finish = {
        x: last.x + last.w / 2 + 5,
        y: last.y + 0.5,
        reward: difficulty.completionBonus
    };

    const level = {
        difficultyKey,
        difficulty,
        seed,
        platforms,
        coins,
        enemies,
        finish
    };

    if (!validateLeibJumpLevel(level)) {
        return generateFallbackLevel(difficultyKey, seed);
    }

    return level;
}

export function validateLeibJumpLevel(level) {
    if (!level?.platforms || level.platforms.length < 2) return false;

    for (let i = 1; i < level.platforms.length; i++) {
        const previous = level.platforms[i - 1];
        const current = level.platforms[i];
        const edgeGap = current.x - current.w / 2 - (previous.x + previous.w / 2);
        const rise = current.y - previous.y;

        if (edgeGap > MAX_SAFE_GAP) return false;
        if (rise > MAX_SAFE_RISE) return false;
        if (rise < -MAX_SAFE_RISE * 1.8 && current.w < MIN_FALL_RECOVERY_WIDTH) return false;
    }

    return true;
}

function generateFallbackLevel(difficultyKey, seed) {
    const difficulty = JUMP_DIFFICULTIES[difficultyKey] || JUMP_DIFFICULTIES.normal;
    const platforms = [];
    const coins = [];
    let x = 0;

    for (let i = 0; i < difficulty.platformCount; i++) {
        const y = Math.sin(i * 0.6) * Math.min(1.8, difficulty.maxRise);
        const w = Math.max(difficulty.minWidth, 4);
        platforms.push({ x, y, w, h: 1, checkpoint: i === 0 });
        coins.push({ x, y: y + 1.8, value: difficulty.rewardMultiplier });
        x += w + Math.min(difficulty.maxGap, 4.5);
    }

    const last = platforms[platforms.length - 1];
    return {
        difficultyKey,
        difficulty,
        seed,
        platforms,
        coins,
        enemies: [],
        finish: {
            x: last.x + last.w / 2 + 4,
            y: last.y + 0.5,
            reward: difficulty.completionBonus
        }
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function hashSeed(seed) {
    const text = String(seed);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function mulberry32(seed) {
    return function nextRandom() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}
