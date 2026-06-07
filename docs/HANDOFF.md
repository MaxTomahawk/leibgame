# Handoff to next agent

| Field | Value |
|-------|--------|
| **Last agent task** | Multi-game platform (hub + Leib Clouds relocation) |
| **Branch** | `cursor/multigame-platform-1a65` |
| **PR** | #8 |
| **Updated** | 2026-06-07 |
| **Status** | ready for merge |

## What was done

- Platform hub at `/` (`index.html` + `platform/hub.js`) lists available games.
- **Leib Clouds** moved to `games/clouds/` — fully playable with Supabase multiplayer, shop, and shared rooms (`?room=code`).
- Shared modules under `shared/`: `supabase.js`, `player-service.js`, `room-service.js`, `asset-config.js`, `asset-registry.js`, `audio-manager.js`, `settings-manager.js`, `model-manager.js`.
- Playwright smoke tests updated: hub UI + Clouds start screen / 3D model previews.
- `playwright.config.js` uses `python3 -m http.server 8000` (not `launcher.py`).

**Test today:**

```bash
cd leibgame
ln -sf ../leibgame-assets/assets ./assets   # optional, for local GLBs
python3 -m http.server 8000 --bind 0.0.0.0
# http://localhost:8000/           → hub
# http://localhost:8000/games/clouds/ → Leib Clouds
npx playwright test tests/example.spec.js tests/model_load.spec.js
```

## Current code snapshot

```
leibgame/
  index.html, config.js, version.json
  platform/hub.js, platform/hub.css
  games/clouds/          → Leib Clouds (index.html, main.js, world.js, …)
  shared/                → supabase, services, asset-config, asset-registry, audio, settings, model-manager
  games/jump/            → not created yet
```

## Next agent prompt (copy verbatim to new agent)

> **Leib Jump! (second game — do not break Clouds)**
>
> Read `docs/CONTEXT.md`, `docs/MAINTAINING_DOCS.md`, `docs/HANDOFF.md`, and `AGENTS.md`. Fetch and branch from latest `main` (`cursor/leib-jump-game-1a65`).
>
> Implement **Leib Jump!** as a 2.5D side-scrolling platformer under `games/jump/`. Add hub entry (set `available: true` in `shared/asset-registry.js`). Difficulty levels: easy, normal, hard. Reuse `shared/` modules (Supabase, assets, audio, settings). Offline-first — game must run without Supabase keys. Must not break Leib Clouds or hub.
>
> Before your draft PR, follow **`docs/MAINTAINING_DOCS.md`** checklist: update `CONTEXT.md`, `ROADMAP.md`, and **rewrite this `HANDOFF.md`** with the next task (or “platform + Jump complete”). Put that prompt in your PR description too.
>
> Extend Playwright: both games reachable from hub. Run `python3 -m http.server 8000` + smoke tests; open draft PR to `main`.

## Docs updated in this branch

- [x] CONTEXT.md
- [x] ROADMAP.md
- [x] HANDOFF.md (this file)
- [ ] DEVELOPMENT.md / AGENTS.md (not needed — run commands unchanged)
