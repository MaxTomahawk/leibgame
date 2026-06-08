# Bundled low-tier GLBs (shipped with leibgame on GitHub Pages)

This folder contains **`*_low.glb` only** — the smallest quality tier bundled in the game repo for fast first load on GitHub Pages.

| Tier | Served from |
|------|-------------|
| `low` | This repo (`/assets/` on Pages) |
| `medium`, `high`, `ultra` | [leibgame-assets CDN](https://MaxTomahawk.github.io/leibgame-assets/assets/) |
| Audio, textures, manifest | leibgame-assets CDN (local: junction) |

## Local development

Recreate the junction to the full assets mirror:

```cmd
cd leibgame
rmdir /S /Q assets 2>nul
del assets 2>nul
mklink /J assets "..\leibgame-assets\assets"
```

## Refresh bundled low files

After optimizing in `leibgame-assets`:

```powershell
node scripts/sync-bundled-low-assets.mjs
git add assets/*_low.glb
```
