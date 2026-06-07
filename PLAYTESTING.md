# Playtesting the two multi-game agent outcomes

You ran the **same prompt twice**. Two different architectures landed on GitHub. **`main` already has Supabase** (PR #2); both candidates still use **Firebase** and need an integration pass.

## The two outcomes (map)

| | **Chat A (~44 min)** | **Chat B (~20 min)** |
|--|----------------------|----------------------|
| **leibgame branch** | `cursor/multi-game-platform-0969` | `cursor/multigame-leib-platform-36ec` |
| **leibgame-assets branch** | `cursor/asset-manifest-prefixes-0969` | `cursor/multigame-leib-assets-36ec` |
| **Layout** | `games/clouds/`, `games/jump/`, `shared/`, `platform/` hub | Flat repo: `games.js` router + `leib-jump.js` at root |
| **Asset catalog** | `shared/asset-registry.js` + `assets/manifest.json` | `asset-library.js` + `assets/asset-manifest.json` |
| **GLB naming** | `{category}_{name}` + legacy fallback (`leib.glb`) | Strict `player_katinka_high.glb` style |
| **Tests** | Playwright (agent reported 4 passed) | Playwright stabilized |
| **Online stack** | Firebase under `games/clouds/` | Firebase at repo root |

**Pair rule:** test game branch with its matching **assets** branch (manifest + file names must agree).

---

## Quick test (laptop)

### Outcome A (folder platform)

```bash
# Terminal 1 — assets (sibling folder)
git clone https://github.com/MaxTomahawk/leibgame-assets.git
cd leibgame-assets && git checkout cursor/asset-manifest-prefixes-0969

# Terminal 2 — game
git clone https://github.com/MaxTomahawk/leibgame.git
cd leibgame && git checkout cursor/multi-game-platform-0969
ln -sf ../leibgame-assets/assets ./assets   # optional local CDN bypass
python3 -m http.server 8000
```

Open `http://localhost:8000` → platform hub → **Leib Clouds** / **Leib Jump!**

### Outcome B (flat router)

```bash
cd leibgame-assets && git checkout cursor/multigame-leib-assets-36ec
cd leibgame && git checkout cursor/multigame-leib-platform-36ec
ln -sf ../leibgame-assets/assets ./assets
python3 -m http.server 8000
```

---

## Test with Supabase (current `main` only)

Anonymous auth enabled → on **`main`**:

```bash
git checkout main
python3 -m http.server 8000
```

Uses **Leibgame-dev** on localhost (`config.js`). Multi-game candidates do **not** use Supabase until integrated.

---

## Which to keep? (practical pick)

| Prefer A if… | Prefer B if… |
|--------------|--------------|
| You want a **clean multi-game repo** (`games/*`, `shared/*`) | You want the **smallest diff** to play with quickly |
| You like **manifest + registry** with legacy asset fallback | You want **strict purpose-prefixed** GLBs everywhere |
| You plan more games later | You might merge Jump into main as a single extra module |

**Recommendation:** start playtesting **Outcome A** (`multi-game-platform` + `asset-manifest-prefixes`) — structure scales better. Borrow ideas from B (level generator, tests) during integration if A is missing polish.

---

## Merge order (when you pick a winner)

1. **leibgame-assets** — merge chosen assets branch → GitHub Pages CDN updates  
2. **leibgame** — integration branch from **`main`** (Supabase), not from old `main`  
3. Port winner layout; replace Firebase with Supabase in Clouds  
4. Point Clouds + Jump at `asset-config.js` / manifest  
5. Test on **Leibgame-dev** only; prod when shipping  

---

## Prompts for a new integration agent

**Compare both (you, before picking):**

```
Check out cursor/multi-game-platform-0969 and cursor/multigame-leib-platform-36ec.
For each: run python3 -m http.server 8000, run playwright tests, list what works/breaks.
Do not merge. Report a comparison table.
```

**Integrate winner (after you choose A or B):**

```
Read PLAYTESTING.md and SUPABASE.md. main has Supabase.

Integrate Outcome A (branches multi-game-platform-0969 + asset-manifest-prefixes-0969)
onto cursor/integrate-multigame-1a65 from main:
- Platform hub + Leib Clouds + Leib Jump!
- Supabase instead of Firebase in Clouds
- asset-config + manifest catalog
- Leibgame-dev only for DB
- Push and open draft PR.
```

---

## Public URL options

| Method | Effort |
|--------|--------|
| `localhost` + phone on same WiFi | Lowest |
| `cloudflared tunnel --url http://localhost:8000` | Low, shareable HTTPS |
| GitHub Pages on candidate branch | Swap branch in Pages settings (one at a time) |
| Cursor Cloud agent on branch | Same as localhost inside VM |

You do **not** need extra hosting to compare the two builds.
