# Handoff to next agent

| Field | Value |
|-------|--------|
| **Last agent task** | *(none yet — waiting for multi-game platform agent)* |
| **Branch** | — |
| **PR** | — |
| **Updated** | 2026-06-07 |
| **Status** | **Start here:** run multi-game platform task (see below) |

## What was done

- `main` has single-game **Leib Clouds** at repo root with Supabase.
- Agent docs + `config.js` pre-wired for dev/prod.
- Failed multi-game branches removed.

**Test today:**

```bash
cd leibgame && python3 -m http.server 8000 --bind 0.0.0.0
# http://localhost:8000 → Leib Clouds, Online! on dev Supabase
```

## Current code snapshot

```
leibgame/ (main)
  index.html, main.js, world.js, multiplayer.js, …
  shared/ not yet — target layout in docs/CONTEXT.md
```

## Next agent prompt (copy verbatim to new agent)

> **Multi-game platform (Leib Clouds only — not Jump yet)**
>
> Read `docs/CONTEXT.md`, `docs/MAINTAINING_DOCS.md`, `docs/HANDOFF.md`, and `AGENTS.md`. Fetch and branch from latest `main` (`cursor/multigame-platform-1a65`).
>
> Build the multi-game platform: hub at `/`, move Leib Clouds to `games/clouds/`, shared modules under `shared/`, hub UI under `platform/`. Supabase multiplayer + shop must still work. Do **not** implement Leib Jump.
>
> Before your draft PR, follow **`docs/MAINTAINING_DOCS.md`** checklist: update `CONTEXT.md`, `ROADMAP.md`, and **rewrite this `HANDOFF.md`** with the Leib Jump prompt for the *next* agent. Put that Jump prompt in your PR description too.
>
> Run Playwright smoke tests; open draft PR to `main`.

## Docs updated in this branch

- [x] CONTEXT.md (initial)
- [x] ROADMAP.md (initial)
- [x] HANDOFF.md (this file)
- [x] MAINTAINING_DOCS.md
