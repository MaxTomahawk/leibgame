# Bundled low-tier GLBs

Committed path: `assets/*_low.glb` in the leibgame repo (GitHub Pages).

See [`assets/README.md`](../assets/README.md) when the junction is removed, or this table:

| Tier | Production source |
|------|-------------------|
| `low` | `/assets/` in leibgame repo |
| `medium`+ | leibgame-assets CDN |
| Audio/textures | leibgame-assets CDN |

Sync after optimize: `node scripts/sync-bundled-low-assets.mjs`
