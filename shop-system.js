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

    // Check of Ronnie unlocked is EN laad opgeslagen upgrades
    async syncUserData(userId) {
        if (!userId) return;
        const userRef = doc(this.db, "users", userId);
        const snap = await getDoc(userRef);
        
        if (snap.exists()) {
            const data = snap.data();
            
            // 1. Ronnie Check
            this.isRonnieUnlocked = !!data.ronnieUnlocked;

            // 2. Upgrades inladen
            if (data.upgrades) {
                for (const [key, level] of Object.entries(data.upgrades)) {
                    if (this.upgrades[key]) {
                        this.upgrades[key].current = level;
                        console.log(`🔧 Upgrade geladen: ${key} niveau ${level}`);
                    }
                }
            }
        }
    }

    async interactWithRonnie(playerStars, playerCoins, saveProgressCallback) {
        if (!this.isRonnieUnlocked) {
            if (playerStars >= 50) {
                const confirmUnlock = confirm("Ronnie: 'Eyyy, je hebt veel van die knakker uitgeroeid. Voor 50 sterren open ik mijn shop voor je. Deal?'");
                if (confirmUnlock) {
                    this.isRonnieUnlocked = true;
                    // Save Ronnie unlock
                    await setDoc(doc(this.db, "users", this.auth.currentUser.uid), {
                        ronnieUnlocked: true,
                        stars: increment(-50)
                    }, { merge: true });

                    saveProgressCallback(-50, 0); 
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

        // 1. Update lokaal
        item.current++;
        
        // 2. Update Coins lokaal via callback (zodat UI update)
        saveProgressCallback(0, -item.cost); 

        // 3. OPSLAAN IN DATABASE (Persistentie)
        try {
            const userRef = doc(this.db, "users", this.auth.currentUser.uid);
            // We gebruiken dot-notatie om alleen dit specifieke veld in de map te updaten
            const updateData = {};
            updateData[`upgrades.${upgradeId}`] = item.current;
            updateData['coins'] = increment(-item.cost); // Coins ook in DB updaten voor de zekerheid

            await updateDoc(userRef, updateData);
            console.log("💾 Upgrade opgeslagen in DB");
        } catch (e) {
            console.error("Fout bij opslaan upgrade:", e);
            // Fallback: als update faalt, probeer set met merge (voor nieuwe users)
             await setDoc(doc(this.db, "users", this.auth.currentUser.uid), {
                upgrades: { [upgradeId]: item.current }
            }, { merge: true });
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

    resetRunUpgrades() {
        // Als je wilt dat upgrades permanent blijven, laat je deze functie leeg of verwijder je hem.
        // Als je wilt dat upgrades resetten bij doodgaan, uncomment de regel hieronder:
        // for (let key in this.upgrades) this.upgrades[key].current = 0;
    }
}