import os

# --- INHOUD SHOP SYSTEM ---
shop_system_code = """import { doc, getDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

export class ShopSystem {
    constructor(uiManager, db, auth) {
        this.ui = uiManager;
        this.db = db;
        this.auth = auth;
        this.isRonnieUnlocked = false;
        
        // Shop Inventory Configuration
        this.upgrades = {
            double_jump: { 
                id: 'double_jump', 
                name: 'Double Jump', 
                cost: 20, 
                currency: 'coins', 
                max: 1, 
                current: 0,
                desc: 'Spring nog een keer in de lucht!'
            },
            triple_jump: { 
                id: 'triple_jump', 
                name: 'Triple Jump', 
                cost: 50, 
                currency: 'coins', 
                max: 1, 
                current: 0,
                req: 'double_jump',
                desc: 'De ultieme sprongkracht.'
            },
            summon_cloud: { 
                id: 'summon_cloud', 
                name: 'Summon Cloud', 
                cost: 100, 
                currency: 'coins', 
                max: 1, 
                current: 0,
                desc: 'Roep een wolk op onder je voeten (Action 1).'
            }
        };
    }

    async checkRonnieStatus(userId) {
        if (!userId) return;
        const userRef = doc(this.db, "users", userId);
        const snap = await getDoc(userRef);
        
        if (snap.exists() && snap.data().ronnieUnlocked) {
            this.isRonnieUnlocked = true;
        } else {
            this.isRonnieUnlocked = false;
        }
    }

    async interactWithRonnie(playerStars, playerCoins, saveProgressCallback) {
        if (!this.isRonnieUnlocked) {
            if (playerStars >= 50) {
                const confirmUnlock = confirm("Ronnie: 'Hey gap. Voor 50 sterren open ik mijn shop voor je. Deal?'");
                if (confirmUnlock) {
                    this.isRonnieUnlocked = true;
                    await updateDoc(doc(this.db, "users", this.auth.currentUser.uid), {
                        ronnieUnlocked: true,
                        stars: increment(-50)
                    });
                    saveProgressCallback(-50, 0); 
                    alert("Ronnie: 'Lekker pik. Mijn shop is nu open!'");
                    this.openShopUI(playerCoins);
                }
            } else {
                alert(`Ronnie: 'Ik praat alleen met ballers. Kom terug als je 50 sterren hebt. Je hebt er nu ${playerStars}.'`);
            }
        } else {
            this.openShopUI(playerCoins);
        }
    }

    openShopUI(currentCoins) {
        this.ui.showShopModal(this.upgrades, currentCoins, (upgradeId) => {
            return this.purchaseUpgrade(upgradeId, currentCoins);
        });
    }

    purchaseUpgrade(upgradeId, currentCoins) {
        const item = this.upgrades[upgradeId];
        
        if (item.current >= item.max) return { success: false, msg: "Al gekocht!" };
        if (item.req && this.upgrades[item.req].current < this.upgrades[item.req].max) return { success: false, msg: "Ontgrendel eerst de vorige upgrade!" };
        if (currentCoins < item.cost) return { success: false, msg: "Niet genoeg munten!" };

        item.current++;
        return { success: true, cost: item.cost, msg: `Je hebt ${item.name} gekocht!` };
    }

    getMaxJumps() {
        let jumps = 1;
        if (this.upgrades.double_jump.current > 0) jumps = 2;
        if (this.upgrades.triple_jump.current > 0) jumps = 3;
        return jumps;
    }

    hasCloudAbility() {
        return this.upgrades.summon_cloud.current > 0;
    }

    resetRunUpgrades() {
        for (let key in this.upgrades) {
            this.upgrades[key].current = 0;
        }
    }
}
"""

# --- INHOUD SETTINGS MANAGER ---
settings_manager_code = """export class SettingsManager {
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
                action1: 'KeyE'
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
"""

def create_file(filename, content):
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"✅ {filename} succesvol aangemaakt.")

if __name__ == "__main__":
    create_file("shop-system.js", shop_system_code)
    create_file("settings-manager.js", settings_manager_code)
    print("\\nKlaar! Voer nu de handmatige wijzigingen uit in main.js, world.js en ui-manager.js.")