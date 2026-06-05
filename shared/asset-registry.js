/**
 * Global dynamic asset registry — loads manifest.json from leibgame-assets CDN
 * and exposes category-filtered lookups for all games on the Leib platform.
 */

export const ASSET_BASE_URL = 'https://MaxTomahawk.github.io/leibgame-assets/assets/';
export const MANIFEST_URL = `${ASSET_BASE_URL}manifest.json`;

const TIERS = ['ultra', 'high', 'medium', 'low'];

const FALLBACK_MANIFEST = {
    version: 1,
    baseUrl: ASSET_BASE_URL,
    models: [
        { id: 'katinka', category: 'player', fileBase: 'katinka', tiers: TIERS, displayName: 'Katinka', gender: 'F', selectable: true },
        { id: 'leib', category: 'player', fileBase: 'leib', tiers: TIERS, displayName: 'Leib', gender: 'M', selectable: true, default: true },
        { id: 'marco', category: 'player', fileBase: 'marco', tiers: TIERS, displayName: 'Marco', gender: 'M', selectable: true },
        { id: 'ronnie', category: 'npc', fileBase: 'ronnie', tiers: TIERS, displayName: 'Ronnie' },
        { id: 'enemy', category: 'enemy', fileBase: 'enemy', tiers: TIERS, displayName: 'Enemy' },
        { id: 'coin', category: 'prop', fileBase: 'coin', tiers: TIERS, displayName: 'Coin' },
    ],
    textures: [
        { id: 'fire', category: 'texture', file: 'fire.png' },
        { id: 'hava', category: 'texture', file: 'hava.png' },
    ],
    sounds: [
        { id: 'jump', key: 'jump', file: 'sounds/effects/male_jump.wav' },
        { id: 'jump_female', key: 'jump_female', file: 'sounds/effects/female_jump.wav' },
        { id: 'coin', key: 'coin', file: 'sounds/effects/coin.wav' },
        { id: 'hava', key: 'hava', file: 'sounds/effects/hava.wav' },
        { id: 'shoot', key: 'shoot', file: 'sounds/effects/spit.wav' },
        { id: 'fail', key: 'fail', file: 'sounds/effects/fail.wav' },
        { id: 'win', key: 'win', file: 'sounds/effects/win.wav' },
        { id: 'bgm', key: 'bgm', file: 'sounds/soundtrack/hava_leib.mp3', loop: true },
    ],
};

let _instance = null;

export class AssetRegistry {
    constructor() {
        this.manifest = null;
        this.baseUrl = ASSET_BASE_URL;
    }

    static getInstance() {
        if (!_instance) _instance = new AssetRegistry();
        return _instance;
    }

    async load(forceRefresh = false) {
        if (this.manifest && !forceRefresh) return this.manifest;

        try {
            const resp = await fetch(MANIFEST_URL, { cache: 'no-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            this.manifest = await resp.json();
            this.baseUrl = this.manifest.baseUrl || ASSET_BASE_URL;
            console.log(`📦 Asset manifest loaded (${this.manifest.models?.length || 0} models)`);
        } catch (err) {
            console.warn('⚠️ Could not load manifest, using fallback:', err.message);
            this.manifest = FALLBACK_MANIFEST;
            this.baseUrl = ASSET_BASE_URL;
        }
        return this.manifest;
    }

    getModels(category = null) {
        const models = this.manifest?.models || [];
        if (!category) return models;
        return models.filter(m => m.category === category);
    }

    getModel(id) {
        return (this.manifest?.models || []).find(m => m.id === id) || null;
    }

    getSelectablePlayers() {
        return this.getModels('player').filter(m => m.selectable !== false);
    }

    getDefaultPlayer() {
        return this.getModels('player').find(m => m.default) || this.getSelectablePlayers()[0] || null;
    }

    getTextures(category = 'texture') {
        return (this.manifest?.textures || []).filter(t => !category || t.category === category);
    }

    getTexture(id) {
        return (this.manifest?.textures || []).find(t => t.id === id) || null;
    }

    getSounds() {
        return this.manifest?.sounds || [];
    }

    getSound(key) {
        return this.getSounds().find(s => s.key === key || s.id === key) || null;
    }

    getGraphicsQuality() {
        try {
            const saved = localStorage.getItem('leib_settings');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (parsed.graphics) return parsed.graphics;
            }
        } catch (_) { /* ignore */ }
        return 'high';
    }

    getWorldQualitySuffix() {
        return this.getGraphicsQuality() === 'low' ? '_low' : '_high';
    }

    getModelUrl(modelId, quality = null) {
        const model = typeof modelId === 'string' ? this.getModel(modelId) : modelId;
        if (!model) return null;
        const tier = quality || this.getGraphicsQuality();
        const fileBase = model.fileBase || model.id;
        return `${this.baseUrl}${fileBase}_${tier}.glb`;
    }

    getPreviewModelUrl(modelId) {
        const model = this.getModel(modelId);
        if (!model) return null;
        const fileBase = model.fileBase || model.id;
        return `${this.baseUrl}${fileBase}_medium.glb`;
    }

    getTextureUrl(textureId) {
        const tex = this.getTexture(textureId);
        if (!tex) return `${this.baseUrl}${textureId}.png`;
        return `${this.baseUrl}${tex.file}`;
    }

    getSoundUrl(key) {
        const sound = this.getSound(key);
        if (!sound) return null;
        return `${this.baseUrl}${sound.file}`;
    }

    buildAudioMap() {
        const map = {};
        for (const sound of this.getSounds()) {
            const key = sound.key || sound.id;
            map[key] = this.getSoundUrl(key);
        }
        return map;
    }

    /** Resolve legacy full URLs or bare filenames to a model id */
    resolveModelId(modelRef) {
        if (!modelRef) return this.getDefaultPlayer()?.id || 'leib';
        const basename = modelRef.split('/').pop().replace('.glb', '').replace(/_(ultra|high|medium|low)$/, '');
        const prefixed = basename.match(/^(player|npc|enemy|prop|misc)_(.+)$/);
        return prefixed ? prefixed[2] : basename;
    }
}

export const assetRegistry = AssetRegistry.getInstance();
