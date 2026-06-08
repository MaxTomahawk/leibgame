# Project context (agents: read this first)

Single briefing for **leibgame** + **leibgame-assets**. Humans: [`DEVELOPMENT.md`](DEVELOPMENT.md).

**Also read:** [`MAINTAINING_DOCS.md`](MAINTAINING_DOCS.md) (how to keep this file up to date) · [`HANDOFF.md`](HANDOFF.md) (what to do next).

---

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

## Current code (main)

> **Agents:** update this section on every PR that changes layout or entry points. See [`MAINTAINING_DOCS.md`](MAINTAINING_DOCS.md).

Multi-game platform (after `cursor/multigame-platform-1a65` merges):

```
index.html              → platform hub (pick a game)
platform/               → hub UI (hub.js, hub.css)
games/clouds/           → Leib Clouds (3D multiplayer platformer)
shared/                 → supabase, services, asset-config, asset-registry, audio, settings, model-manager
config.js, version.json → repo root (shared by hub + games)
```

- Hub: `http://localhost:8000/` lists games; **Leib Clouds** at `/games/clouds/`.
- Supabase multiplayer, shop, and shared rooms (`?room=code`) work from Clouds.
- Local assets: `asset-config.js` serves `/assets/` on localhost, private LAN, and Tailscale IPs (100.64–127.x); override with `?assets=/assets/`.
- `games/jump/` **not built yet** — next task (see `HANDOFF.md`).

## Target architecture (roadmap)

```
index.html          → platform hub (pick a game)
platform/           → hub UI
games/clouds/       → Leib Clouds (move from root)
games/jump/         → Leib Jump! (second game, after platform lands)
shared/             → supabase, services, asset-config, audio, settings, model-manager, asset-registry
```

Assets: `leibgame-assets/assets/manifest.json` + `shared/asset-registry.js`. Quality tiers high/low.

## Rules for every agent task

1. **Start:** `git pull origin main` → branch `cursor/<name>-1a65`.
2. Read **`CONTEXT.md`** → **`MAINTAINING_DOCS.md`** → **`HANDOFF.md`** → **`AGENTS.md`**.
3. **End:** follow [`MAINTAINING_DOCS.md`](MAINTAINING_DOCS.md) checklist before PR (update this file, `ROADMAP.md`, `HANDOFF.md`).
4. **Never** use deleted branches `cursor/multi-game-platform-*` or `cursor/multigame-leib-platform-*`.
5. Test: `python3 -m http.server 8000 --bind 0.0.0.0` + Playwright smoke tests.
6. Prefer `python3 -m http.server` over `launcher.py` for tests.
7. Minimal diff; match existing style; no scope creep.
8. Pair `leibgame` + `leibgame-assets` branches when manifest changes.

## Task specs (acceptance criteria)

### Multi-game platform (do this before Jump)

- Hub at `/` lists games; **Leib Clouds** fully playable under `games/clouds/`.
- Supabase multiplayer + shop + shared rooms still work.
- Playwright smoke tests updated for hub UI.
- **Do not** add Leib Jump in this task.
- **Handoff:** rewrite `HANDOFF.md` with Leib Jump prompt (see `MAINTAINING_DOCS.md`).

### Leib Jump (only after platform merges)

- `games/jump/` side-scrolling platformer; hub entry; difficulty easy/normal/hard.
- Offline-first; must not break Clouds.
- Playwright: both games reachable from hub.
- **Handoff:** rewrite `HANDOFF.md` (next task or “platform complete”).

## Retired

Failed multi-game agent branches were removed. Build fresh from `main`.

## Documentation contract (summary)

| Question | Answer |
|----------|--------|
| Where is truth? | **This repo** on `main` — especially `docs/*.md` |
| Wiki? | Optional for humans; agents **must** update repo docs |
| Who updates context? | **Every agent**, on their branch, before PR |
| What if I forget? | PR template + `.cursor/rules` require it; task not done without `HANDOFF.md` |
