# Handoff to next agent

| Field | Value |
|-------|--------|
| **Last agent task** | Master workspace setup + Clouds parity on platform branch |
| **Branch** | `cursor/multigame-platform-1a65` (PR #8 not merged to `main` yet) |
| **PR** | #8 |
| **Updated** | 2026-06-08 |
| **Status** | Playwright green — ready for merge |

## What was done

- **Master Folder workspace:** `leibgame.code-workspace` + `docs/WORKSPACE.md` document three-repo layout (game / assets / pipeline).
- **Leib Clouds** at `/games/clouds/` verified against pre-platform `main` behavior: hub → start → play → hub round-trip → bfcache back all work.
- **Tailscale / LAN assets:** `shared/asset-config.js` now treats private IPs (10.x, 172.16–31.x, 192.168.x, 100.64–127.x Tailscale CGNAT) as local dev → serves `/assets/` instead of CDN. Override still works: `?assets=/assets/`.
- **Windows Playwright:** `playwright.config.js` uses `python` on Windows, `python3` elsewhere for the test webServer.
- **Flaky preview test:** `tests/model_load.spec.js` polls for `previewModel` instead of a fixed 3s sleep (parallel load could miss previews on Windows).
- Existing PR fixes retained: **session replay** (`resetSessionForReplay` on bfcache — never dispose WebGL on `pagehide`; main never did), WebGL preview dispose only on Start, scoped `#game-canvas` CSS, previews stay on character switch via `disposePlayerModel()`, quality-suffixed model URLs, `../../version.json` from `games/clouds/`.

**Test today:**

```bash
cd leibgame
# Windows junction (once):
#   mklink /J assets "..\leibgame-assets\assets"
# Linux/macOS:
#   ln -sf ../leibgame-assets/assets ./assets
python -m http.server 8000 --bind 0.0.0.0   # Windows
# python3 -m http.server 8000 --bind 0.0.0.0  # Linux/macOS
npx playwright test tests/example.spec.js tests/model_load.spec.js tests/clouds_start.spec.js
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
> Read `docs/CONTEXT.md`, `docs/MAINTAINING_DOCS.md`, `docs/HANDOFF.md`, and `AGENTS.md`. Fetch and branch from latest `main` after PR #8 merges (`cursor/leib-jump-game-1a65`).
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
- [x] DEVELOPMENT.md / AGENTS.md
- [x] docs/WORKSPACE.md
