export const ASSET_BASE_URL = 'https://MaxTomahawk.github.io/leibgame-assets/assets/';
export const ASSET_MANIFEST_URL = `${ASSET_BASE_URL}asset-manifest.json`;

const QUALITY_ORDER = ['ultra', 'high', 'medium', 'low'];
const DEFAULT_QUALITY = 'high';

const FALLBACK_MANIFEST = {
    version: 1,
    baseUrl: ASSET_BASE_URL,
    purposes: {
        player: [
            createLegacyModelAsset('player_leib', 'Leib', 'leib'),
            createLegacyModelAsset('player_katinka', 'Katinka', 'katinka', { gender: 'F' }),
            createLegacyModelAsset('player_marco', 'Marco', 'marco')
        ],
        npc: [
            createLegacyModelAsset('npc_ronnie', 'Ronnie', 'ronnie')
        ],
        enemy: [
            createLegacyModelAsset('enemy_cloud_imp', 'Cloud Imp', 'enemy')
        ],
        collectible: [
            createLegacyModelAsset('collectible_coin', 'Coin', 'coin')
        ],
        texture: [
            { id: 'texture_cloud_tile', type: 'texture', displayName: 'Cloud Tile', files: { default: 'hava.png' } },
            { id: 'texture_fireball', type: 'texture', displayName: 'Fireball', files: { default: 'fire.png' } }
        ],
        audio: [
            { id: 'audio_music_hava_leib', type: 'audio', channel: 'music', displayName: 'Hava Leib', files: { default: 'sounds/soundtrack/hava_leib.mp3' } },
            { id: 'audio_sfx_jump_male', type: 'audio', channel: 'sfx', displayName: 'Male Jump', files: { default: 'sounds/effects/male_jump.wav' } },
            { id: 'audio_sfx_jump_female', type: 'audio', channel: 'sfx', displayName: 'Female Jump', files: { default: 'sounds/effects/female_jump.wav' } },
            { id: 'audio_sfx_coin', type: 'audio', channel: 'sfx', displayName: 'Coin', files: { default: 'sounds/effects/coin.wav' } },
            { id: 'audio_sfx_hava', type: 'audio', channel: 'sfx', displayName: 'Hava', files: { default: 'sounds/effects/hava.wav' } },
            { id: 'audio_sfx_shoot', type: 'audio', channel: 'sfx', displayName: 'Spit', files: { default: 'sounds/effects/spit.wav' } },
            { id: 'audio_sfx_fail', type: 'audio', channel: 'sfx', displayName: 'Fail', files: { default: 'sounds/effects/fail.wav' } },
            { id: 'audio_sfx_win', type: 'audio', channel: 'sfx', displayName: 'Win', files: { default: 'sounds/effects/win.wav' } }
        ]
    }
};

let manifestPromise = null;
let cachedManifest = null;

function createLegacyModelAsset(id, displayName, legacyBaseName, extra = {}) {
    return {
        id,
        type: 'model',
        displayName,
        legacyBaseName,
        scale: 1,
        files: {
            ultra: `${legacyBaseName}_ultra.glb`,
            high: `${legacyBaseName}_high.glb`,
            medium: `${legacyBaseName}_medium.glb`,
            low: `${legacyBaseName}_low.glb`
        },
        ...extra
    };
}

function normalizeManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') return FALLBACK_MANIFEST;

    const normalized = {
        ...manifest,
        baseUrl: manifest.baseUrl || ASSET_BASE_URL,
        purposes: manifest.purposes || {}
    };

    for (const [purpose, fallbackAssets] of Object.entries(FALLBACK_MANIFEST.purposes)) {
        if (!Array.isArray(normalized.purposes[purpose]) || normalized.purposes[purpose].length === 0) {
            normalized.purposes[purpose] = fallbackAssets;
        }
    }

    return normalized;
}

export async function loadAssetManifest({ forceRefresh = false } = {}) {
    if (cachedManifest && !forceRefresh) return cachedManifest;
    if (manifestPromise && !forceRefresh) return manifestPromise;

    manifestPromise = fetch(`${ASSET_MANIFEST_URL}?v=${Date.now()}`, { cache: 'no-store' })
        .then(response => {
            if (!response.ok) throw new Error(`Asset manifest HTTP ${response.status}`);
            return response.json();
        })
        .then(manifest => {
            cachedManifest = normalizeManifest(manifest);
            return cachedManifest;
        })
        .catch(error => {
            console.warn('Using bundled asset manifest fallback:', error);
            cachedManifest = FALLBACK_MANIFEST;
            return cachedManifest;
        });

    return manifestPromise;
}

export function getPreferredQuality() {
    try {
        const saved = localStorage.getItem('leib_settings');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (QUALITY_ORDER.includes(parsed.graphics)) return parsed.graphics;
        }
    } catch (error) {
        console.warn('Could not read graphics quality:', error);
    }

    return DEFAULT_QUALITY;
}

export async function getAssetsByPurpose(purpose, { type } = {}) {
    const manifest = await loadAssetManifest();
    const assets = manifest.purposes[purpose] || [];
    return type ? assets.filter(asset => asset.type === type) : assets;
}

export async function getPlayerModelAssets() {
    return getAssetsByPurpose('player', { type: 'model' });
}

export async function findAssetById(id, purpose = null) {
    const manifest = await loadAssetManifest();
    const purposeEntries = purpose
        ? [[purpose, manifest.purposes[purpose] || []]]
        : Object.entries(manifest.purposes || {});

    for (const [, assets] of purposeEntries) {
        const match = assets.find(asset => asset.id === id || asset.legacyBaseName === id);
        if (match) return match;
    }

    return null;
}

export function buildAssetUrl(fileName, manifest = cachedManifest || FALLBACK_MANIFEST) {
    if (!fileName) return null;
    if (/^https?:\/\//i.test(fileName)) return fileName;
    return `${manifest.baseUrl || ASSET_BASE_URL}${fileName}`;
}

export async function resolveAssetUrl(assetOrId, {
    purpose = null,
    quality = getPreferredQuality(),
    preferredFileKey = null
} = {}) {
    const manifest = await loadAssetManifest();
    const asset = typeof assetOrId === 'string'
        ? await findAssetById(stripModelExtension(assetOrId), purpose)
        : assetOrId;

    if (!asset) {
        return buildAssetUrl(assetOrId, manifest);
    }

    const files = asset.files || {};
    const chosenFile = preferredFileKey ? files[preferredFileKey] : null;
    const qualityFile = files[quality] || QUALITY_ORDER.map(tier => files[tier]).find(Boolean);
    const defaultFile = files.default || Object.values(files)[0];

    return buildAssetUrl(chosenFile || qualityFile || defaultFile, manifest);
}

export async function resolveModelAsset(modelRef, purpose = 'player') {
    const id = stripModelExtension(modelRef);
    const asset = await findAssetById(id, purpose) || await findAssetById(id);
    const quality = getPreferredQuality();
    const url = await resolveAssetUrl(asset || modelRef, { purpose, quality });

    return {
        asset,
        id: asset?.id || id,
        url,
        quality,
        scale: asset?.scale || 1,
        gender: asset?.gender || null
    };
}

export async function getAudioAssetMap() {
    const audioAssets = await getAssetsByPurpose('audio');
    const aliases = {
        bgm: 'audio_music_hava_leib',
        jump: 'audio_sfx_jump_male',
        jump_female: 'audio_sfx_jump_female',
        coin: 'audio_sfx_coin',
        hava: 'audio_sfx_hava',
        shoot: 'audio_sfx_shoot',
        fail: 'audio_sfx_fail',
        win: 'audio_sfx_win'
    };

    const entries = await Promise.all(Object.entries(aliases).map(async ([key, assetId]) => {
        const asset = audioAssets.find(item => item.id === assetId);
        return [key, await resolveAssetUrl(asset || assetId, { purpose: 'audio' })];
    }));

    return Object.fromEntries(entries);
}

export async function getTextureUrl(assetId) {
    return resolveAssetUrl(assetId, { purpose: 'texture', preferredFileKey: 'default' });
}

function stripModelExtension(value) {
    return String(value || '')
        .split('/')
        .pop()
        .replace(/\.glb$/i, '')
        .replace(/_(ultra|high|medium|low)$/i, '');
}
