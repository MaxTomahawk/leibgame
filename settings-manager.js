export class SettingsManager {
    constructor() {
        this.defaultSettings = {
            sensitivity: 1.0,
            volume: 0.5,
            keybinds: {
                forward: 'KeyW',
                backward: 'KeyS',
                left: 'KeyA',
                right: 'KeyD',
                jump: 'Space',
                sprint: 'ShiftLeft',
                interact: 'KeyE',   // E is nu puur voor interactie
                action1: 'F'   // F is nu voor de Cloud Ability
            }
        };
        this.settings = this.loadSettings();
    }

    loadSettings() {
        const saved = localStorage.getItem('leib_settings');
        if (saved) {
            return { ...this.defaultSettings, ...JSON.parse(saved) };
        }
        return this.defaultSettings;
    }

    saveSettings() {
        localStorage.setItem('leib_settings', JSON.stringify(this.settings));
    }

    getKeyAction(keyCode) {
        return Object.keys(this.settings.keybinds).find(key => this.settings.keybinds[key] === keyCode);
    }
}
