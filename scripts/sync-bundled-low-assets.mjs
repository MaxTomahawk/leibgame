#!/usr/bin/env node
/**
 * Copy *_low.glb from leibgame-assets into leibgame/assets/ for GitHub Pages bundling.
 *
 * Usage (from leibgame repo root):
 *   node scripts/sync-bundled-low-assets.mjs
 *   node scripts/sync-bundled-low-assets.mjs --assets-root ../leibgame-assets
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(GAME_ROOT, 'assets');

function parseArgs (argv) {
  const out = { assetsRoot: path.resolve(GAME_ROOT, '..', 'leibgame-assets') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--assets-root') out.assetsRoot = path.resolve(argv[++i]);
    if (argv[i] === '--help' || argv[i] === '-h') out.help = true;
  }
  return out;
}

function main () {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/sync-bundled-low-assets.mjs [--assets-root ../leibgame-assets]');
    process.exit(0);
  }

  const srcDir = path.join(args.assetsRoot, 'assets');
  if (!fs.existsSync(srcDir)) {
    console.error(`Source not found: ${srcDir}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const lowFiles = fs.readdirSync(srcDir).filter((f) => f.endsWith('_low.glb'));
  if (lowFiles.length === 0) {
    console.error(`No *_low.glb in ${srcDir}`);
    process.exit(1);
  }

  for (const file of lowFiles) {
    const src = path.join(srcDir, file);
    const dest = path.join(OUT_DIR, file);
    fs.copyFileSync(src, dest);
    console.log(`  ${file}`);
  }
  console.log(`Synced ${lowFiles.length} low-tier GLB(s) → ${OUT_DIR}`);
}

main();
