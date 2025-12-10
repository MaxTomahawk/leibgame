import { doc, getDoc, setDoc, updateDoc, increment } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

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
                desc: 'Roep een wolk op onder je voeten.'
            },
            glide: { 
                id: 'glide', 
                name: 'Glide', 
                cost: 100,
                currency: 'coins', 
                max: 1, 
                current: 0,
                desc: 'Klik Q in de lucht om te zweven.',
                req: 'double_jump'
            }
        };
    }

    // --- LOCAL STORAGE HELPERS (Offline Mode) ---
    loadLocalData() {
        try {
            const saved = localStorage.getItem('shopProgress');
            if (saved) {
                const data = JSON.parse(saved);
                this.isRonnieUnlocked = !!data.ronnieUnlocked;
                if (data.upgrades) {
                    for (const [key, level] of Object.entries(data.upgrades)) {
                        if (this.upgrades[key]) {
                            this.upgrades[key].current = level;
                        }
                    }
                }
                console.log("🛒 Shop data loaded locally");
            }
        } catch (e) {
            console.warn("Kon lokale shop data niet laden:", e);
        }
    }

    _saveLocalData() {
        try {
            const data = {
                ronnieUnlocked: this.isRonnieUnlocked,
                upgrades: {}
            };
            for (const [key, item] of Object.entries(this.upgrades)) {
                data.upgrades[key] = item.current;
            }
            localStorage.setItem('shopProgress', JSON.stringify(data));
            console.log("💾 Shop data saved locally");
        } catch (e) {
            console.warn("Kon shop data niet lokaal opslaan:", e);
        }
    }

    // --- ONLINE SYNC ---
    async syncUserData(userId) {
        if (!userId || !this.db) return;
        try {
            const userRef = doc(this.db, "users", userId);
            const snap = await getDoc(userRef);
            
            if (snap.exists()) {
                const data = snap.data();
                this.isRonnieUnlocked = !!data.ronnieUnlocked;

                if (data.upgrades) {
                    for (const [key, level] of Object.entries(data.upgrades)) {
                        if (this.upgrades[key]) {
                            this.upgrades[key].current = level;
                            console.log(`🔧 Upgrade geladen: ${key} niveau ${level}`);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn("Sync failed, falling back to local:", e);
            this.loadLocalData();
        }
    }

    async interactWithRonnie(playerStars, playerCoins, saveProgressCallback) {
        if (!this.isRonnieUnlocked) {
            if (playerStars >= 50) {
                const confirmUnlock = confirm("Ronnie: 'Eyyy, je hebt veel van die knakkers uitgeroeid. Voor 50 sterren open ik mijn shop voor je. Deal?'");
                if (confirmUnlock) {
                    this.isRonnieUnlocked = true;
                    
                    // Callback voor UI update (sterren eraf)
                    saveProgressCallback(-50, 0); 

                    // 1. Probeer Cloud Save
                    if (this.auth && this.db && this.auth.currentUser) {
                        try {
                            await setDoc(doc(this.db, "users", this.auth.currentUser.uid), {
                                ronnieUnlocked: true,
                                stars: increment(-50)
                            }, { merge: true });
                        } catch (e) {
                            console.error("Cloud save failed:", e);
                            this._saveLocalData(); // Fallback
                        }
                    } else {
                        // 2. Offline Save
                        this._saveLocalData();
                    }

                    alert("Ronnie: 'Geef me je centjes!'");
                    this.openShopUI(playerCoins, saveProgressCallback);
                }
            } else {
                alert(`Ronnie: 'Ik praat alleen met mensen die verstand van geld hebben. Kom terug als je 50 sterren hebt. Je hebt er nu ${playerStars}.'`);
            }
        } else {
            this.openShopUI(playerCoins, saveProgressCallback);
        }
    }

    openShopUI(currentCoins, saveProgressCallback) {
        this.ui.showShopModal(this.upgrades, currentCoins, async (upgradeId, coinsNow) => {
            return await this.purchaseUpgrade(upgradeId, coinsNow, saveProgressCallback);
        });
    }

    async purchaseUpgrade(upgradeId, currentCoins, saveProgressCallback) {
        const item = this.upgrades[upgradeId];
        
        // Validatie
        if (item.current >= item.max) return { success: false, msg: "Al gekocht!" };
        if (item.req && this.upgrades[item.req].current < this.upgrades[item.req].max) return { success: false, msg: "Ontgrendel eerst de vorige upgrade!" };
        if (currentCoins < item.cost) return { success: false, msg: "Niet genoeg munten!" };

        // 1. Update in Memory
        item.current++;
        
        // 2. Update Coins lokaal via callback
        saveProgressCallback(0, -item.cost); 

        // 3. OPSLAAN (Cloud of Lokaal)
        if (this.auth && this.db && this.auth.currentUser) {
            try {
                const userRef = doc(this.db, "users", this.auth.currentUser.uid);
                const updateData = {};
                updateData[`upgrades.${upgradeId}`] = item.current;
                updateData['coins'] = increment(-item.cost);

                await updateDoc(userRef, updateData);
                console.log("💾 Upgrade opgeslagen in DB");
            } catch (e) {
                console.error("Fout bij opslaan upgrade in cloud:", e);
                // Fallback: probeer merge als update faalt
                 try {
                    await setDoc(doc(this.db, "users", this.auth.currentUser.uid), {
                        upgrades: { [upgradeId]: item.current }
                    }, { merge: true });
                 } catch (e2) {
                     this._saveLocalData();
                 }
            }
        } else {
            // Offline save
            this._saveLocalData();
        }

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

    hasGlideAbility() {
        return this.upgrades.glide && this.upgrades.glide.current > 0;
    }
}