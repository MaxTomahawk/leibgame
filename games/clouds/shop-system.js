import { savePlayerProgress, patchPlayerProfile } from '../../shared/player-service.js';

export class ShopSystem {
  constructor (uiManager, supabase, userId) {
    this.ui = uiManager;
    this.supabase = supabase;
    this.userId = userId;
    this.isRonnieUnlocked = false;

    this.upgrades = {
      double_jump: {
        id: 'double_jump',
        name: 'Double Jump',
        cost: 10,
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
        cost: 30,
        currency: 'stars',
        max: 1,
        current: 0,
        desc: 'Roep een wolk op onder je voeten.'
      },
      glide: {
        id: 'glide',
        name: 'Glide',
        cost: 30,
        currency: 'stars',
        max: 1,
        current: 0,
        desc: 'Klik Q in de lucht om te zweven.',
        req: 'double_jump'
      },
      rapid_fire: {
        id: 'rapid_fire',
        name: 'Rapid Fire',
        cost: 10,
        currency: 'coins',
        max: 1,
        current: 0,
        desc: 'Schiet vuurballen zonder cooldown!'
      }
    };
  }

  loadLocalData () {
    try {
      const saved = localStorage.getItem('shopProgress');
      if (!saved) return;
      const data = JSON.parse(saved);
      this.isRonnieUnlocked = !!data.ronnieUnlocked;
      if (data.upgrades) {
        for (const [key, level] of Object.entries(data.upgrades)) {
          if (this.upgrades[key]) this.upgrades[key].current = level;
        }
      }
    } catch (e) {
      console.warn('Kon lokale shop data niet laden:', e);
    }
  }

  _saveLocalData () {
    try {
      const data = {
        ronnieUnlocked: this.isRonnieUnlocked,
        upgrades: {}
      };
      for (const [key, item] of Object.entries(this.upgrades)) {
        data.upgrades[key] = item.current;
      }
      localStorage.setItem('shopProgress', JSON.stringify(data));
    } catch (e) {
      console.warn('Kon shop data niet lokaal opslaan:', e);
    }
  }

  _upgradesToObject () {
    const out = {};
    for (const [key, item] of Object.entries(this.upgrades)) {
      out[key] = item.current;
    }
    return out;
  }

  applyProfileData (profile) {
    if (!profile) return;
    this.isRonnieUnlocked = !!profile.ronnie_unlocked;
    if (profile.upgrades) {
      for (const [key, level] of Object.entries(profile.upgrades)) {
        if (this.upgrades[key]) this.upgrades[key].current = level;
      }
    }
  }

  async syncUserData (profile) {
    if (profile) {
      this.applyProfileData(profile);
      return;
    }
    this.loadLocalData();
  }

  async interactWithRonnie (playerStars, playerCoins, saveProgressCallback) {
    if (!this.isRonnieUnlocked) {
      if (playerCoins >= 15) {
        const confirmUnlock = confirm("Ronnie: '20 Muntjes graag!'");
        if (confirmUnlock) {
          this.isRonnieUnlocked = true;
          saveProgressCallback(0, -20);
          await this._persistShopState(playerCoins - 20);
          alert("Ronnie: 'Geef me je centjes!'");
          this.openShopUI(playerCoins - 20, saveProgressCallback);
        }
      } else {
        alert(`Ronnie: 'Ik praat alleen met mensen die verstand van geld hebben. Kom terug als je 15 muntjes hebt. Je hebt er nu ${playerCoins}.'`);
      }
    } else {
      this.openShopUI(playerCoins, saveProgressCallback);
    }
  }

  openShopUI (currentCoins, saveProgressCallback) {
    this.ui.showShopModal(this.upgrades, currentCoins, async (upgradeId, coinsNow) => {
      return await this.purchaseUpgrade(upgradeId, coinsNow, saveProgressCallback);
    });
  }

  async purchaseUpgrade (upgradeId, currentCoins, saveProgressCallback) {
    const item = this.upgrades[upgradeId];
    if (item.current >= item.max) return { success: false, msg: 'Al gekocht!' };
    if (item.req && this.upgrades[item.req].current < this.upgrades[item.req].max) {
      return { success: false, msg: 'Ontgrendel eerst de vorige upgrade!' };
    }
    if (currentCoins < item.cost) return { success: false, msg: 'Niet genoeg munten!' };

    item.current++;
    saveProgressCallback(0, -item.cost);
    await this._persistShopState(currentCoins - item.cost);
    return { success: true, cost: item.cost, msg: `Je hebt ${item.name} gekocht!` };
  }

  async _persistShopState (coinsHint) {
    if (this.supabase && this.userId) {
      try {
        await savePlayerProgress(this.supabase, this.userId, {
          coins: coinsHint,
          upgrades: this._upgradesToObject(),
          ronnieUnlocked: this.isRonnieUnlocked
        });
        return;
      } catch (e) {
        console.error('Cloud shop save failed:', e);
      }
    }
    this._saveLocalData();
  }

  getMaxJumps () {
    let jumps = 1;
    if (this.upgrades.double_jump.current > 0) jumps = 2;
    if (this.upgrades.triple_jump.current > 0) jumps = 3;
    return jumps;
  }

  hasCloudAbility () {
    return this.upgrades.summon_cloud.current > 0;
  }

  hasGlideAbility () {
    return this.upgrades.glide && this.upgrades.glide.current > 0;
  }

  hasRapidFire () {
    return this.upgrades.rapid_fire && this.upgrades.rapid_fire.current > 0;
  }
}
