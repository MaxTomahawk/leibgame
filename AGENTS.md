# AGENTS.md

## Read first

| File | Why |
|------|-----|
| [`docs/CONTEXT.md`](docs/CONTEXT.md) | Architecture, Supabase, task specs, rules |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Human-oriented setup (also useful for agents) |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What’s done / next |

The user gives a **short goal** (see [`docs/AGENT_PROMPTS.md`](docs/AGENT_PROMPTS.md)). You load the rest from here.

---

## Cursor Cloud

### Repos

| Repo | Path |
|------|------|
| leibgame | `repos/leibgame` |
| leibgame-assets | `repos/leibgame-assets` |

Optional local assets: `ln -sf ../leibgame-assets/assets ./assets`

### Supabase

**Pre-configured in `config.js`.** Do not ask the user for anon keys.

- `localhost` → Leibgame-dev
- `github.io` → prod
- `?supabase=dev|prod` override

### Run & test

```bash
cd repos/leibgame
python3 -m http.server 8000 --bind 0.0.0.0
npx playwright test tests/example.spec.js tests/model_load.spec.js
```

Use HTTP server, not `launcher.py`, for Playwright.

### Branches

`cursor/<name>-1a65` from `main`. Do not use deleted `cursor/multi-game-platform-*` or `cursor/multigame-leib-platform-*`.
