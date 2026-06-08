# Handoff to next agent

| Field | Value |
|-------|--------|
| **Last agent task** | PR #8 merged to main — Pages deploy, bundled low assets, Tailscale docs |
| **Branch** | `main` |
| **PR** | #8 (merged locally; push `main` to origin) |
| **Updated** | 2026-06-08 |
| **Status** | ready — push main + enable GitHub Pages (Actions) |

## What was done

- **PR #8** merged to `main`: hub at `/`, Leib Clouds at `/games/clouds/`, Clouds parity fixes, Playwright green.
- **GitHub Pages:** `.github/workflows/deploy-pages.yml` deploys on every push to `main`.
- **Asset split:** `*_low.glb` committed in `assets/`; medium/high/ultra + audio from `leibgame-assets` CDN on Pages. Local/Tailscale uses junction → `/assets/`.
- **`scripts/sync-bundled-low-assets.mjs`** refreshes low tiers from leibgame-assets after optimize.
- **Tailscale / SSH:** `docs/REMOTE_ACCESS.md`, `scripts/start-server.ps1`.
- **Master workspace:** `../HANDOFF.md` at Master Folder root aggregates all repos.

**Push required (auth):**

```powershell
git push origin main
```

**One-time GitHub:** Settings → Pages → Build and deployment → **GitHub Actions** (same for `leibgame-assets`).

**Test today:**

```powershell
# Recreate junction for full local assets
cmd /c "cd /d D:\Code\Leibgame Master Folder\leibgame && rmdir assets 2>nul & del assets 2>nul & mklink /J assets ..\leibgame-assets\assets"
python -m http.server 8000 --bind 0.0.0.0
npx playwright test tests/example.spec.js tests/model_load.spec.js tests/clouds_start.spec.js
```

## Current code snapshot

```
leibgame/
  index.html, config.js, version.json
  assets/              → *_low.glb only (bundled for Pages)
  platform/            → hub
  games/clouds/        → Leib Clouds
  shared/              → asset-config (CDN + bundled routing), …
  scripts/             → sync-bundled-low-assets.mjs, start-server.ps1
```

## Next agent prompt (copy verbatim to new agent)

> **Leib Jump! (second game — do not break Clouds)**
>
> Read `docs/CONTEXT.md`, `docs/MAINTAINING_DOCS.md`, `docs/HANDOFF.md`, and `AGENTS.md`. Branch from latest `main` (`cursor/leib-jump-game-1a65`).
>
> Implement **Leib Jump!** as a 2.5D side-scrolling platformer under `games/jump/`. Add hub entry (`available: true` in `shared/asset-registry.js`). Difficulty: easy, normal, hard. Reuse `shared/`. Offline-first. Must not break Clouds or hub.
>
> Before PR: update `CONTEXT.md`, `ROADMAP.md`, rewrite `HANDOFF.md`. Extend Playwright for both games. Run smoke tests.

## Docs updated

- [x] CONTEXT.md
- [x] ROADMAP.md
- [x] HANDOFF.md
- [x] DEVELOPMENT.md / WORKSPACE.md / REMOTE_ACCESS.md
