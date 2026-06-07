# AGENTS.md

Instructions for **Cursor Cloud agents** (and humans) working in this workspace.

**Start here:** [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) · [`docs/ROADMAP.md`](docs/ROADMAP.md) · [`docs/AGENT_PROMPTS.md`](docs/AGENT_PROMPTS.md)

---

## Cursor Cloud specific instructions

### Repositories

| Repo | Path | Role |
|------|------|------|
| **leibgame** | `repos/leibgame` | Game client (HTML/JS/CSS, Python dev server, Playwright tests) |
| **leibgame-assets** | `repos/leibgame-assets` | 3D/audio assets + optimize pipeline |

Runtime assets default to GitHub Pages CDN. For unreleased GLBs:  
`ln -sf ../leibgame-assets/assets ./assets` (served as `/assets/` on localhost via `asset-config.js`).

### Supabase: always dev in this environment

`config.js` routes **localhost / 127.0.0.1 → Leibgame-dev** (`qriaaekzknwffqlflftx`).  
**Do not** point agent testing at the prod project (`hwpxsaamvtqabtxyndlm`) unless the user explicitly asks.

| Project | Ref | Use |
|---------|-----|-----|
| Leibgame-dev | `qriaaekzknwffqlflftx` | Local dev, Cloud agents, playtests |
| Leibgame | `hwpxsaamvtqabtxyndlm` | GitHub Pages only |

Paste the **dev anon key** into `config.js` (see `config.example.js`). Empty key → offline mode.

Override: `?supabase=dev` or `?supabase=prod`.

Schema: [`supabase/schema.sql`](supabase/schema.sql). Setup: [`SUPABASE.md`](SUPABASE.md).

### What we are building

- **Now:** Leib Clouds on `main` (single game, Supabase multiplayer).
- **Next:** Multi-game hub + Leib Jump — see [`docs/ROADMAP.md`](docs/ROADMAP.md).
- **Do not use** deleted branches `cursor/multi-game-platform-*` or `cursor/multigame-leib-platform-*`.

Use [`docs/AGENT_PROMPTS.md`](docs/AGENT_PROMPTS.md) for the canonical multi-game task description.

### Running the game

From `repos/leibgame`:

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Open `http://localhost:8000`.

Avoid `launcher.py` in Cloud/CI — it opens a desktop browser and can hang Playwright.

### Tests

```bash
npx playwright install chromium   # first time
npx playwright test tests/example.spec.js tests/model_load.spec.js
npm run test:e2e
```

Start the HTTP server in tmux before Playwright so `reuseExistingServer` works.

### Multiplayer data model

- `player_profiles` — coins, stars, shop upgrades
- `rooms` — shared world + collected coins
- `room_players` — live presence (Realtime)
- Default room: `main_world`; custom: `?room=code`

### Known quirks

- WebGL required for Start button (`modelLoaded`). Headless Chromium usually works.
- `leibgame-assets` npm script name vs `scripts/optimize-assets.mjs` path mismatch.
- No ESLint/TypeScript lint configured.

### Branch naming (Cloud agents)

Use `cursor/<descriptive-name>-1a65` for feature branches.
