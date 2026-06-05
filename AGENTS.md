# AGENTS.md

## Cursor Cloud specific instructions

### Repositories

| Repo | Path | Role |
|------|------|------|
| **leibgame** | `repos/leibgame` | Game client (HTML/JS/CSS, Python dev server, Playwright tests) |
| **leibgame-assets** | `repos/leibgame-assets` | 3D/audio assets + `npm run optimize` pipeline (optional for runtime) |

At runtime the game loads assets from GitHub Pages (`MaxTomahawk.github.io/leibgame-assets`), not the local assets checkout unless you change `ASSET_BASE_URL` in `model-manager.js`.

### Running the game

From `repos/leibgame`:

```bash
python3 launcher.py
# or, without auto-opening a browser (preferred in headless/cloud):
python3 -m http.server 8000
```

Open `http://localhost:8000`.

**Note:** `launcher.py` opens a desktop browser via `webbrowser`/`xdg-open`. Playwright's `webServer` uses `launcher.py`, which can spawn extra browser processes and slow or hang test runs. For tests, prefer starting `python3 -m http.server 8000` in tmux first so Playwright reuses it (`reuseExistingServer` when not in CI).

### Tests

From `repos/leibgame` (see `README.md`):

```bash
npx playwright install chromium   # first time only
npx playwright test tests/example.spec.js   # smoke (external playwright.dev)
npm run test:e2e                  # all tests in ./tests
```

- `tests/example.spec.js` — template tests against playwright.dev; pass reliably.
- `tests/model_load.spec.js` — game-specific but **out of date** (expects `"Multiplayer connected!"` / `"Start Spel"`; multiplayer is off by default and UI uses `"Start Game"`).
- No ESLint/TypeScript lint script is configured.

### Multiplayer / Firebase

Disabled by default (`FEATURES.MULTIPLAYER = false` in `main.js`). No local DB; offline mode uses `localStorage`.

### Known quirks

- `index.html` references missing `ui.js` (404). Game logic loads via `main.js` → `ui-manager.js`; the stray script tag is harmless but noisy in network logs.
- 3D character previews and gameplay need WebGL. Playwright Chromium headless works for start-screen → in-game flow; desktop browser in GPU-less VMs may fail WebGL and block the Start button (`modelLoaded` never becomes true).
- Asset pipeline in `leibgame-assets`: `package.json` script points to `optimize-assets.js` but the file is `scripts/optimize-assets.mjs`.

### Optional: local assets server

Only needed if overriding `ASSET_BASE_URL`:

```bash
cd repos/leibgame-assets && python3 -m http.server 8080
```
