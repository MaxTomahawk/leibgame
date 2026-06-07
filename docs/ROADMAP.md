# Roadmap

## Current state (`main`)

- [x] Leib Clouds — single-page 3D platformer
- [x] Supabase — profiles, shared rooms, live multiplayer
- [x] Dev/prod Supabase split (`config.js`)
- [x] Asset CDN via `leibgame-assets` on GitHub Pages
- [x] Playwright smoke tests
- [x] Cursor Cloud dev environment (`AGENTS.md`)
- [x] Agent doc contract (`docs/MAINTAINING_DOCS.md`, `docs/HANDOFF.md`, PR template)

## In progress

- [ ] **Multi-game platform** — one site, hub + multiple games (tell agent: see `docs/AGENT_PROMPTS.md` step 1)
- [ ] **Leib Jump!** — 2.5D side-scrolling platformer as second game (step 2)

## Later (not scheduled)

- OAuth (Google/GitHub) on top of anonymous accounts
- Unified progression across games (shared wallet on `player_profiles`)
- More games under `games/<id>/`
- CI: inject prod Supabase keys on GitHub Pages deploy

## Architecture principles

1. **One GitHub Pages site** — `leibgame` repo; assets stay in `leibgame-assets`.
2. **Supabase only** — no Firebase.
3. **Dev data stays on dev** — localhost and agents use Leibgame-dev.
4. **Offline fallback** — empty/missing keys → localStorage, game still runs.
5. **Manifest-driven assets** — `leibgame-assets/assets/manifest.json` + client registry; localhost symlink for unreleased assets.

## Retired experiments

These branches were tried and **deleted** (do not reuse):

- `cursor/multi-game-platform-0969` / `cursor/multi-game-platform-supabase-1a65`
- `cursor/multigame-leib-platform-36ec` / `cursor/multigame-leib-platform-supabase-1a65`

Build fresh from `main` using the agent prompts in `docs/AGENT_PROMPTS.md`.
