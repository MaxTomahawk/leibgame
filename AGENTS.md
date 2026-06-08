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
ln -sf ../leibgame-assets/assets ./assets   # required for local GLB/audio (not optional for full verification)
python3 -m http.server 8000 --bind 0.0.0.0  # Windows local: use `python` instead
npx playwright test tests/example.spec.js tests/model_load.spec.js tests/clouds_start.spec.js
```

Use HTTP server, not `launcher.py`, for Playwright. On Windows, `playwright.config.js` uses `python`; on Linux/macOS/Cloud it uses `python3`.

### Verify in a real browser (mandatory before PR)

Automated tests are not enough. You **must** manually confirm in Cursor Cloud desktop or local browser:

1. Hub at `http://localhost:8000/` lists games and opens Clouds.
2. Clouds: pick character → **Start Game** → world loads and you can move.
3. Return to hub → open Clouds again → start still works (catches bfcache / overlay bugs).
4. If assets fail to load, check the `assets` symlink and Network tab for 404s on `*_high.glb` (never bare `leib.glb`).

Report what you verified in the PR **Tested** section.

### Branches

`cursor/<name>-1a65` from latest `main`.

### Before you open a PR

See **`docs/MAINTAINING_DOCS.md`** — update `CONTEXT.md`, `ROADMAP.md`, `HANDOFF.md` on your branch.
