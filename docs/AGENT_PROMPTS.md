# Agent prompts

Copy-paste these into a **new Cursor Cloud agent** (or local agent). Read [`AGENTS.md`](../AGENTS.md) and [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) first.

**Recommendation: use two agents in sequence**, not one mega-agent.

| Order | Scope | Why separate |
|-------|--------|--------------|
| **Agent 1** | Multi-game platform + move Leib Clouds | Large refactor; must stay playable and tested before adding Jump |
| **Agent 2** | Leib Jump! as second game | Different mechanics; builds on stable hub from Agent 1 |

---

## Agent 1 — Multi-game platform (Leib Clouds)

```
You are working on https://github.com/MaxTomahawk/leibgame (branch from main).

Read before coding:
- docs/DEVELOPMENT.md
- docs/ROADMAP.md
- AGENTS.md
- SUPABASE.md

Context:
- main already has Leib Clouds at repo root with Supabase (not Firebase).
- Failed multi-game branches were deleted; do NOT cherry-pick them.
- Two repos: leibgame (client) + leibgame-assets (CDN). Local dev: symlink ../leibgame-assets/assets → ./assets
- localhost / Cursor Cloud MUST use Leibgame-dev Supabase (config.js routes automatically). Never test against prod.

Goal — multi-game platform v1 (Clouds only must work end-to-end):

1. Restructure without breaking Leib Clouds:
   - index.html at / = platform hub (pick a game)
   - games/clouds/ = current Leib Clouds (move from root)
   - shared/ = supabase.js, player-service.js, room-service.js, asset-config.js, settings-manager.js, audio-manager.js, model-manager.js (shared modules)
   - platform/ = hub UI (list games, character select, auth status)

2. Asset catalog:
   - Use leibgame-assets manifest (assets/manifest.json)
   - shared/asset-registry.js resolves models/textures/audio; asset-config.js for base URL (/assets/ on localhost)
   - Keep quality tiers (high/low) working

3. Supabase:
   - Keep existing schema and services; fix import paths after move
   - Multiplayer + shop + shared rooms must work in games/clouds/
   - Offline fallback when config keys empty

4. leibgame-assets:
   - If manifest changes needed, branch cursor/multigame-manifest-1a65 off main
   - Document which assets branch pairs with your game branch

5. Quality bar:
   - python3 -m http.server 8000 --bind 0.0.0.0
   - npx playwright test tests/example.spec.js tests/model_load.spec.js (update tests for hub UI)
   - Manual: hub → Leib Clouds → online status, collect coin, see peer in ?room=test
   - docs/DEVELOPMENT.md still accurate

6. Deliverables:
   - Branch cursor/multigame-platform-1a65
   - Draft PR to main with short demo notes
   - Do NOT add Leib Jump yet — leave games/jump/ as stub or omit

Constraints:
- Minimal scope; no redesign of gameplay
- Match existing code style
- No Firebase
- No Supabase branch instances (use dev project only for testing)
```

---

## Agent 2 — Leib Jump! (after Agent 1 merges or branch is stable)

Run this **only after** Agent 1’s hub + `games/clouds/` work and tests pass.

```
You are working on https://github.com/MaxTomahawk/leibgame.

Read docs/DEVELOPMENT.md, docs/ROADMAP.md, AGENTS.md. Branch from main (or from the merged multigame platform branch if Agent 1 PR is open — coordinate with user).

Context:
- Platform hub exists at / with games/clouds/ (Leib Clouds, Supabase multiplayer).
- leibgame-assets serves GLBs via manifest + GitHub Pages.
- Dev Supabase only for any online features.

Goal — add Leib Jump! as second game:

1. games/jump/:
   - Side-scrolling / lane-based platformer (2.5D), inspired by prior leib-jump experiments but written clean
   - index.html or routed entry from hub (games/jump/ or ?game=jump — follow Agent 1 routing pattern)
   - Own main.js, level-generator, styles; reuse shared/audio-manager, settings-manager, asset-registry where sensible

2. Hub integration:
   - Platform lists "Leib Clouds" + "Leib Jump!"
   - Jump difficulty selector (easy/normal/hard) on start screen
   - Jump is single-player / offline-first (no Supabase required for v1)

3. Progression (v1 simple):
   - Jump rewards can write to same player_profiles coins/stars OR localStorage only — pick simplest that works offline; document choice in PR

4. Assets:
   - Reuse player models from manifest (player_leib, etc.)
   - Branch leibgame-assets if new jump-specific assets needed

5. Tests:
   - Playwright: hub shows both games; Jump starts without console errors
   - Clouds regression still passes

6. Deliverables:
   - Branch cursor/leib-jump-game-1a65
   - Draft PR to main
   - Update docs/ROADMAP.md checkboxes

Constraints:
- Do not break games/clouds/ or Supabase multiplayer
- No Firebase
- Keep Jump scope shippable — polished vertical slice, not endless features
```

---

## Optional — Single combined agent (not recommended)

If you insist on one agent, merge the two prompts but **stop after Clouds works and open a PR** before starting Jump in the same branch. Otherwise the agent usually breaks both.

---

## Assets-only agent (if manifest work is large)

```
Repo: https://github.com/MaxTomahawk/leibgame-assets (branch from main).

Read leibgame docs/DEVELOPMENT.md for manifest conventions.

Goal:
- assets/manifest.json with purpose groups: player, npc, enemy, collectible, texture, audio
- IDs like player_leib, enemy_cloud_imp, collectible_coin (prefix by purpose)
- Legacy fallback filenames (leib_high.glb) documented in manifest
- npm run optimize via scripts/optimize-assets.mjs unchanged

Pair with leibgame branch cursor/multigame-platform-1a65.
Push branch cursor/multigame-manifest-1a65 and draft PR.
```
