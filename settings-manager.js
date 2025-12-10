export class SettingsManager {
    /**
     * Initializes the settings manager with default values and loads saved data.
     */
    constructor() {
        this.defaultSettings = {
            weather: 'dynamic', // 'dynamic', 'day', or 'night'
            audio: {
                master: 100,
                music: 100, // mp3
                sfx: 100    // wav
            },
            keybinds: {
                forward: 'KeyW',
                backward: 'KeyS',
                left: 'KeyA',
                right: 'KeyD',
                jump: 'Space',
                sprint: 'ShiftLeft',
                interact: 'KeyE',
                cloud: 'KeyF',
                glide: 'KeyQ'
            },
            modifiers: {
                baseGravity: 17.5,
                tripGravity: 10.0,
                jumpSpeed: 14.0,
                walkSpeed: 12.0,
                runSpeed: 18.0,
                dragGrounded: 3.0,
                dragAir: 1.8,
                infiniteJump: false
            },
            graphics: 'low',
            sensitivity: 1.0
        };
        this.settings = this.loadSettings();
    }

    /**
     * Loads settings from local storage and merges them with defaults.
     * Includes error handling for corrupted data types (e.g. invalid weather objects).
     * @returns {Object} The merged settings object.
     */
    loadSettings() {
        const saved = localStorage.getItem('leib_settings');
        // Always start with a fresh copy of defaults
        let settings = JSON.parse(JSON.stringify(this.defaultSettings));

        if (saved) {
            try {
                const parsed = JSON.parse(saved);

                // 1. Recover/Load 'weather' (only if it is a valid string)
                if (parsed.weather && typeof parsed.weather === 'string') {
                    settings.weather = parsed.weather;
                }
                if (parsed.graphics && typeof parsed.graphics === 'string') {
                    settings.graphics = parsed.graphics;
                }
                if (parsed.sensitivity && typeof parsed.sensitivity === 'number') {
                    settings.sensitivity = parsed.sensitivity;
                }

                // 2. Merge nested objects (audio, keybinds, modifiers)
                if (parsed.audio) settings.audio = { ...settings.audio, ...parsed.audio };
                if (parsed.keybinds) settings.keybinds = { ...settings.keybinds, ...parsed.keybinds };
                if (parsed.modifiers) settings.modifiers = { ...settings.modifiers, ...parsed.modifiers };
                
            } catch (e) {
                console.error("Settings corrupted, resetting to defaults", e);
            }
        }
        return settings;
    }

    /**
     * Persists the current settings object to the browser's local storage.
     */
    saveSettings() {
        localStorage.setItem('leib_settings', JSON.stringify(this.settings));
    }

    /**
     * Retrieves a high-level setting category or value.
     * @param {string} category - The key to retrieve (e.g., 'audio', 'weather').
     * @returns {*} The value of the setting.
     */
    get(category) {
        return this.settings[category];
    }
    
    /**
     * Helper to retrieve a nested value within a category.
     * @param {string} category - The parent category (e.g., 'modifiers').
     * @param {string} key - The specific key (e.g., 'baseGravity').
     * @returns {*} The value.
     */
    getValue(category, key) {
        return this.settings[category][key];
    }

    /**
     * Updates a setting value.
     * Automatically handles merging for objects (like audio settings) 
     * and direct assignment for primitives (like weather strings).
     * @param {string} category - The setting category to update.
     * @param {*} value - The new value or object to merge.
     */
    set(category, value) {
        // If both the current value and new value are objects, perform a merge
        if (this.settings[category] !== undefined && 
            typeof this.settings[category] === 'object' && 
            typeof value === 'object' && 
            !Array.isArray(value)) {
            
            this.settings[category] = { ...this.settings[category], ...value };
        } else {
            // Otherwise, perform a direct assignment (e.g. for 'weather')
            this.settings[category] = value;
        }
        this.saveSettings();
    }

    /**
     * Resets all settings to their default values and saves them.
     * @returns {Object} The default settings object.
     */
    resetToDefaults() {
        this.settings = JSON.parse(JSON.stringify(this.defaultSettings));
        this.saveSettings();
        return this.settings;
    }

    /**
     * Finds the action name associated with a specific key code.
     * @param {string} keyCode - The keyboard code (e.g., 'KeyW').
     * @returns {string|undefined} The action name (e.g., 'forward') or undefined.
     */
    getKeyAction(keyCode) {
        return Object.keys(this.settings.keybinds).find(key => this.settings.keybinds[key] === keyCode);
    }
}