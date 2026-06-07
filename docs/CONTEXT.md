# Project context (agents: read this first)

Single briefing for **leibgame** + **leibgame-assets**. Humans: [`DEVELOPMENT.md`](DEVELOPMENT.md).

## Repos

| Repo | Role |
|------|------|
| `leibgame` | Game client → GitHub Pages |
| `leibgame-assets` | GLB/audio CDN + `scripts/optimize-assets.mjs` |

Local unreleased assets: `ln -sf ../leibgame-assets/assets ./assets` → served as `/assets/` on localhost (`asset-config.js`).

## Online stack

- **Supabase** only (no Firebase). Schema: `supabase/schema.sql`.
- **`config.js` is pre-wired** — dev/prod keys + routing. Localhost → **Leibgame-dev**. Do not reconfigure unless asked.
- Tables: `player_profiles`, `rooms`, `room_players`. Room: `main_world` or `?room=code`.
- Offline fallback if keys missing (should not happen on `main`).

## Current code (`main`)

Single game **Leib Clouds** at repo root (`index.html`, `main.js`, multiplayer, shop).

## Target architecture (next work)

```
index.html          → platform hub (pick a game)
platform/           → hub UI
games/clouds/       → Leib Clouds (move from root)
games/jump/         → Leib Jump! (second game, after platform lands)
shared/             → supabase, services, asset-config, audio, settings, model-manager, asset-registry
```

Assets: `leibgame-assets/assets/manifest.json` + `shared/asset-registry.js`. Quality tiers high/low.

## Rules for every agent task

1. Branch from `main`: `cursor/<name>-1a65`.
2. **Never** use deleted branches `cursor/multi-game-platform-*` or `cursor/multigame-leib-platform-*`.
3. Test: `python3 -m http.server 8000 --bind 0.0.0.0` then `npx playwright test tests/example.spec.js tests/model_load.spec.js`.
4. Prefer `python3 -m http.server` over `launcher.py` for tests.
5. Minimal diff; match existing style; no scope creep.
6. Draft PR to `main` when done; update `docs/ROADMAP.md` checkboxes if shipping a roadmap item.
7. Pair `leibgame` + `leibgame-assets` branches when manifest changes.

## Task specs (detailed acceptance criteria)

### Multi-game platform (do this before Jump)

- Hub at `/` lists games; **Leib Clouds** fully playable under `games/clouds/`.
- Supabase multiplayer + shop + shared rooms still work.
- Playwright smoke tests updated for hub UI.
- **Do not** add Leib Jump in this task.

### Leib Jump (only after platform merges)

- `games/jump/` side-scrolling platformer; hub entry; difficulty easy/normal/hard.
- Offline-first; must not break Clouds.
- Playwright: both games reachable from hub.

## Retired

Failed multi-game agent branches were removed. Build fresh from `main`.
