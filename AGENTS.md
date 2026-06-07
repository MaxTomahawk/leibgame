# AGENTS.md

## Read first (in order)

| # | File | Purpose |
|---|------|---------|
| 1 | [`docs/CONTEXT.md`](docs/CONTEXT.md) | What the project is, current vs target layout, rules |
| 2 | [`docs/MAINTAINING_DOCS.md`](docs/MAINTAINING_DOCS.md) | **How to update docs** — mandatory before every PR |
| 3 | [`docs/HANDOFF.md`](docs/HANDOFF.md) | What the last agent did + **prompt for you** |
| 4 | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | Run, test, troubleshoot |
| 5 | [`docs/ROADMAP.md`](docs/ROADMAP.md) | Done / not done |

The human gives a short goal ([`docs/AGENT_PROMPTS.md`](docs/AGENT_PROMPTS.md)). **You** keep docs on your branch current so merge → `main` → next agent never loses context.

---

## Cursor Cloud

### Repos

| Repo | Path |
|------|------|
| leibgame | `repos/leibgame` |
| leibgame-assets | `repos/leibgame-assets` |

Optional: `ln -sf ../leibgame-assets/assets ./assets`

### Supabase

Pre-configured in `config.js`. `localhost` → Leibgame-dev. Do not ask for keys.

### Run & test

```bash
cd repos/leibgame
python3 -m http.server 8000 --bind 0.0.0.0
npx playwright test tests/example.spec.js tests/model_load.spec.js
```

Use HTTP server, not `launcher.py`, for Playwright.

### Branches

`cursor/<name>-1a65` from latest `main`.

### Before you open a PR

See **`docs/MAINTAINING_DOCS.md`** — update `CONTEXT.md`, `ROADMAP.md`, `HANDOFF.md` on your branch.
