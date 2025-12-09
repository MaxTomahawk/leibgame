# Leib the Game

A third-person RPG platformer.
~~~ Can you reach the castle of King Willem? ~~~

## ✨ Amazing Features

* **Platforming Action:** Jump across clouds and reach the King!
* **3D Character Models:** Featuring Leib and other characters.
* **Performance Optimized:** Includes a custom LOD (Level of Detail) system for smooth performance on all devices.
* **Graphics Settings:** Switch between Low (Performance) and High (Quality) graphics.
* **Multiplayer:** Play together online!
* **Mobile Support:** Fully playable on iOS and Android with touch controls.
* **Atmosphere:** Real particle effects, UFOs, and mountains.
* **Shop System:** Collect Coins and Stars to buy upgrades.
* **Abilities:** Unlock abilities like Cloud Summoning.
* **Characters:** Diverse cast including Leib Weissman and an Easter egg character.
* **World:** A new and improved Castle of Willem.

## 🖼️ Images
![Gameplay Screenshot](image.png)
![Character Screenshot](image2.png)

## 🛠️ Local Setup

To test local development, please run the Python launcher:

```bash
python launcher.py
```

Then navigate to `http://localhost:8000` in your browser.

## 🎨 Development & Assets

We use an automated asset optimization pipeline to ensure the game runs smoothly on high-end PCs and mobile devices alike.

* **Asset Workflow:** Want to add new 3D models? Please read the **[Asset Workflow Wiki](https://github.com/wytzig/leibgame/wiki/Asset%E2%80%90Workflow#asset-workflow--graphics-optimization)** for instructions on using the `optimize-assets.js` script.
* **Raw Assets:** Always place original `.glb` files in the `raw_assets/` folder, never directly in `assets/`.

## 🧪 Playwright Tests

To run end-to-end tests:

```bash
# Initialize (first time only)
npm init playwright@latest
npm install --save-dev @playwright/test
sudo npx playwright install-deps
npx playwright install
```

**Running tests:**

```bash
npx playwright test
```

**Debugging tests:**

```bash
npx playwright test --debug
```

## 👥 Authors
* G. M. Kaislscherer
* L. Weissman