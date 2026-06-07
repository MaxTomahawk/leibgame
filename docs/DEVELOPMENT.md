# Development guide

Human-friendly setup for **leibgame** + **leibgame-assets**.

**New agent?** See [`AGENT_PROMPTS.md`](AGENT_PROMPTS.md) or [`HANDOFF.md`](HANDOFF.md). Agents read [`CONTEXT.md`](CONTEXT.md) + [`MAINTAINING_DOCS.md`](MAINTAINING_DOCS.md) and **update those files on their branch** before merge.

**Wiki:** optional for humans ([GitHub Wiki](https://github.com/MaxTomahawk/leibgame/wiki)). Agents always use repo `docs/` — never wiki-only instructions.

## What this project is

| Piece | Repo | Role |
|-------|------|------|
| Game client | [leibgame](https://github.com/MaxTomahawk/leibgame) | HTML/JS (Three.js), hosted on GitHub Pages |
| Assets CDN | [leibgame-assets](https://github.com/MaxTomahawk/leibgame-assets) | GLB/audio/textures + optimize pipeline |

**Today on `main`:** multi-game platform — hub at `/`, **Leib Clouds** at `/games/clouds/` with Supabase multiplayer and cloud saves.

**Next goal:** **Leib Jump!** as second game under `games/jump/`. See [`docs/ROADMAP.md`](ROADMAP.md) and [`docs/HANDOFF.md`](HANDOFF.md).

### What we already decided (don’t re-litigate)

- **Supabase** replaces Firebase (merged in PR #2).
- **Two Supabase projects** on the free tier: **dev** for localhost/agents, **prod** for GitHub Pages.
- **Do not** use Supabase branching on free tier — use two projects instead.
- **Anonymous auth** enabled on both projects.
- Schema lives in [`supabase/schema.sql`](../supabase/schema.sql); setup steps in [`SUPABASE.md`](../SUPABASE.md).
- Failed multi-game agent branches were **removed** — do not resurrect `cursor/multi-game-platform-*` or `cursor/multigame-leib-platform-*`.

---

## Quick start (5 minutes)

### 1. Clone both repos (sibling folders)

```bash
git clone https://github.com/MaxTomahawk/leibgame.git
git clone https://github.com/MaxTomahawk/leibgame-assets.git
cd leibgame
npm install
npx playwright install chromium   # optional, for tests
```

### 2. Supabase (already configured)

**Nothing to paste.** `config.js` in the repo has dev + prod anon keys and picks the right project automatically:

| Environment | Project | When |
|-------------|---------|------|
| **dev** | Leibgame-dev | `localhost`, Cursor Cloud agents |
| **prod** | Leibgame | GitHub Pages |

Override: `?supabase=dev` or `?supabase=prod`.

Clone and run — status should show **Online!** on localhost.

### 3. Local assets (required for agent verification)

By default production uses the GitHub Pages CDN. **Agents must symlink** `leibgame-assets` for reliable local testing and to catch asset-path bugs:

```bash
cd leibgame
ln -sf ../leibgame-assets/assets ./assets
```

Without the symlink, some flows still work via CDN, but you cannot fully verify gameplay. To test **unpublished** GLBs:

```bash
ln -sf ../leibgame-assets/assets ./assets
```

`asset-config.js` serves `/assets/` on localhost.

### 4. Run

```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

Open **http://localhost:8000**. Status should show **Online!** when dev key is set.

### 5. Tests

```bash
npx playwright test tests/example.spec.js tests/model_load.spec.js
```

Prefer `python3 -m http.server 8000` over `launcher.py` when running Playwright (see `AGENTS.md`).

---

## Dev vs prod Supabase

```
localhost / 127.0.0.1 / Cursor Cloud  →  Leibgame-dev
github.io (GitHub Pages)              →  Leibgame (prod)
?supabase=dev|prod                    →  override
```

**Rule:** never point playtests or agent work at **prod** unless you are explicitly shipping.

Tables (both projects, same schema):

- `player_profiles` — coins, stars, shop upgrades per user
- `rooms` — shared world layout + collected coins per room
- `room_players` — live player positions (Realtime)

Default room: `main_world`. Custom room: `/?room=friday`.

---

## Share a local build with a friend

```bash
# Terminal 1
python3 -m http.server 8000 --bind 0.0.0.0

# Terminal 2 (install cloudflared once)
cloudflared tunnel --url http://localhost:8000
```

Send the `https://….trycloudflare.com` link. For multiplayer together, add the same room:  
`https://….trycloudflare.com/?room=playtest`

Same Wi‑Fi: friend opens `http://YOUR_LAN_IP:8000` (server must use `--bind 0.0.0.0`).

---

## Repo layout today (`main`)

```
leibgame/
  index.html              # platform hub
  platform/               # hub UI (hub.js, hub.css)
  games/clouds/           # Leib Clouds (3D multiplayer platformer)
  shared/                 # supabase, services, asset-config, asset-registry, audio, settings, model-manager
  config.js               # dev/prod Supabase routing
  version.json
  supabase/schema.sql
```

**Next:** `games/jump/` for Leib Jump! — see [`HANDOFF.md`](HANDOFF.md).

---

## Assets workflow

See [leibgame-assets wiki](https://github.com/MaxTomahawk/leibgame-assets/wiki/Workflow:-optimizing-assets).

```bash
cd leibgame-assets
npm install
npm run optimize -- --help   # script: scripts/optimize-assets.mjs
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| “Offline” on localhost | Check `config.js` exists; Anonymous auth enabled in Supabase dev project |
| Models 404 locally | `ln -sf ../leibgame-assets/assets ./assets` |
| Multiplayer desync | Same `?room=`; Realtime on `rooms` + `room_players` |
| Playwright hangs | Use `python3 -m http.server 8000`, not `launcher.py` |
| Start button disabled | WebGL/model load failed — check console + asset URLs |
