# Local testing — both multi-game outcomes (Supabase)

Both agent outcomes now have **Supabase** branches (same online stack as `main`). Use this guide to run them on your laptop and share a link with a friend on another network.

## Prerequisites

- **Node.js** 18+ (for Playwright tests only)
- **Python 3** (to serve static files)
- **Supabase `config.js`** with keys (see below)
- Two sibling folders: `leibgame` and `leibgame-assets`

Anonymous sign-in must be **enabled** on your Supabase project (Auth → Providers → Anonymous).

---

## 1. Supabase keys (`config.js`)

In the **leibgame** repo:

```bash
cp config.example.js config.js
```

Fill in from Supabase dashboard → **Project Settings → API**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

**Recommended:** use your **Leibgame-dev** project for local playtests. Leave keys empty to run **offline** (localStorage only; status shows “Offline”).

---

## 2. Outcome A — folder platform (`games/clouds`, `games/jump`)

| Repo | Branch |
|------|--------|
| leibgame | `cursor/multi-game-platform-supabase-1a65` |
| leibgame-assets | `cursor/asset-manifest-prefixes-0969` |

```bash
# Assets
git clone https://github.com/MaxTomahawk/leibgame-assets.git
cd leibgame-assets
git checkout cursor/asset-manifest-prefixes-0969
npm install   # optional

# Game (sibling folder)
cd ..
git clone https://github.com/MaxTomahawk/leibgame.git
cd leibgame
git checkout cursor/multi-game-platform-supabase-1a65
npm install
npx playwright install chromium   # optional, for tests

# Local assets (optional — skips GitHub CDN for unreleased GLBs)
ln -sf ../leibgame-assets/assets ./assets

# Serve (bind all interfaces so LAN/tunnel can reach you)
python3 -m http.server 8000 --bind 0.0.0.0
```

Open **http://localhost:8000** → platform hub → **Leib Clouds** (online) or **Leib Jump!** (offline).

---

## 3. Outcome B — flat router (`games.js` + `leib-jump.js`)

| Repo | Branch |
|------|--------|
| leibgame | `cursor/multigame-leib-platform-supabase-1a65` |
| leibgame-assets | `cursor/multigame-leib-assets-36ec` |

```bash
cd leibgame-assets && git checkout cursor/multigame-leib-assets-36ec
cd ../leibgame && git checkout cursor/multigame-leib-platform-supabase-1a65
ln -sf ../leibgame-assets/assets ./assets   # optional
python3 -m http.server 8000 --bind 0.0.0.0
```

Same URL: **http://localhost:8000** — game picker on one page.

---

## 4. What to verify

| Check | Expect |
|-------|--------|
| Start screen status | **Online!** when `config.js` has keys |
| Leib Clouds | Other players visible in same room |
| Coins / shop | Progress persists after refresh (Supabase profile) |
| `/?room=friday` | Shared world layout + collected coins for that room |
| No keys in `config.js` | **Offline** — still playable via localStorage |

Run automated smoke tests (from `leibgame`):

```bash
npx playwright test tests/example.spec.js tests/model_load.spec.js
```

---

## 5. Share with a friend on another network

Your friend cannot use `localhost` on *your* machine. Expose your local server with a **tunnel**.

### Option A — Cloudflare Tunnel (free, no account for quick try)

Install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/), then:

```bash
# Terminal 1 — keep the game server running
python3 -m http.server 8000 --bind 0.0.0.0

# Terminal 2 — tunnel
cloudflared tunnel --url http://localhost:8000
```

Copy the `https://….trycloudflare.com` URL and send it to your friend.

### Option B — ngrok

```bash
ngrok http 8000
```

Share the `https://….ngrok-free.app` URL.

### Multiplayer together

1. Both use the **same tunnel URL** (or same `?room=` name).
2. Example: `https://YOUR-TUNNEL.trycloudflare.com/?room=playtest`
3. Use the **dev** Supabase project in `config.js` so prod stays clean.

**Note:** Tunnel URLs change each time unless you pay for a fixed subdomain. For a stable link, deploy a branch to GitHub Pages instead.

---

## 6. Same Wi‑Fi (no tunnel)

If your friend is on the same LAN:

1. Find your LAN IP: `ip addr` (Linux) or `ipconfig` (Windows).
2. Friend opens `http://YOUR_LAN_IP:8000`.
3. Server must use `--bind 0.0.0.0` (not default localhost-only).

---

## 7. Compare A vs B

| | Outcome A | Outcome B |
|--|-----------|-----------|
| Layout | `games/clouds/`, `games/jump/`, `platform/` | Flat: `games.js` router |
| Assets catalog | `shared/asset-registry.js` + `manifest.json` | `asset-library.js` + `asset-manifest.json` |
| Supabase modules | `shared/supabase.js`, etc. | Root: `supabase.js`, etc. |

Pick one after playtesting, then integrate the winner onto `main` (see `SUPABASE.md`).

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Status stays “Offline” | Fill `config.js`; enable Anonymous auth in Supabase |
| Models 404 | `ln -sf ../leibgame-assets/assets ./assets` or check assets branch matches game branch |
| Friend sees blank page | Use tunnel URL; ensure `--bind 0.0.0.0` |
| Players don’t see each other | Same `?room=` value; Realtime enabled on `rooms` + `room_players` (see `SUPABASE.md`) |
