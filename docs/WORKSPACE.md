# Master Folder workspace

Local development uses three sibling repos under **`D:\Code\Leibgame Master Folder\`**.

## Layout

```
Leibgame Master Folder/
  leibgame.code-workspace   ← open this in Cursor
  AGENTS.md                 ← workspace-level agent contract
  leibgame/                 ← game client
  leibgame-assets/          ← CDN assets + optimize pipeline
  leibgame-pipeline/        ← ComfyUI art factory (local only)
```

## Open in Cursor

```powershell
cursor "D:\Code\Leibgame Master Folder\leibgame.code-workspace"
```

## Assets junction (Windows)

From `leibgame/` (both repos must be siblings):

```cmd
mklink /J assets "..\leibgame-assets\assets"
```

Verify: `assets\leib_high.glb` exists. If `leibgame-assets\assets` is empty, run `git lfs pull` in that repo.

Linux/macOS: `ln -sf ../leibgame-assets/assets ./assets`

## Three-repo workflow

```
ComfyUI (:8188)
       │
       ▼
leibgame-pipeline/generate.mjs
       │  writes variants only
       ▼
leibgame-pipeline/staging/{slug}/variant-N/
       │  user picks
       ▼
leibgame-pipeline/promote.mjs
       │  only allowed path into assets repo
       ▼
leibgame-assets/raw_assets/…
       │  npm run optimize (scripts/optimize-assets.mjs)
       ▼
leibgame-assets/assets/…  ← junction → leibgame/assets/
       │
       ▼
leibgame (localhost / GitHub Pages)
```

## Pipeline daily commands

ComfyUI must be running locally (user install, e.g. `D:\Code\ComfyUI`) at **http://127.0.0.1:8188**. It is **not** bundled in any repo.

```powershell
cd D:\Code\Leibgame Master Folder\leibgame-pipeline

# Generate variants (saved to staging/ only)
node pipeline/generate.mjs --recipe tile-platform --prompt "grass platform tile" --variants 4 --slug my-tile

# After picking a variant folder under staging/
node pipeline/promote.mjs --pick my-tile/variant-2 --to tiles/

# Optimize promoted GLBs into shipped tiers
cd ..\leibgame-assets\scripts
npm install
node optimize-assets.mjs
```

See `leibgame-pipeline/docs/PROMOTE_CONTRACT.md` for path rules and `leibgame-pipeline/README.md` for install.

## Game dev

```powershell
cd D:\Code\Leibgame Master Folder\leibgame
python -m http.server 8000 --bind 0.0.0.0
```

Hub: **http://localhost:8000/** · Leib Clouds: **http://localhost:8000/games/clouds/**

Tests:

```powershell
npx playwright test tests/example.spec.js tests/model_load.spec.js tests/clouds_start.spec.js
```

## GitHub Pages

Push to **`main`** triggers `.github/workflows/deploy-pages.yml`.

| Site | URL |
|------|-----|
| Game | `https://maxtomahawk.github.io/leibgame/` |
| Assets | `https://maxtomahawk.github.io/leibgame-assets/assets/` |

One-time: repo **Settings → Pages → Source: GitHub Actions** (both repos).

**Bundled assets:** only `*_low.glb` live in `leibgame/assets/`; sync after optimize with `node scripts/sync-bundled-low-assets.mjs`.

## Remote access

See [`REMOTE_ACCESS.md`](REMOTE_ACCESS.md) for Tailscale ports, Termius SSH snippets, and ComfyUI over LAN.

When changing `manifest.json` or asset paths, use matching branch names on `leibgame` and `leibgame-assets` and merge together.
