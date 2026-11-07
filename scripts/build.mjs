// Bundles main, preload and renderer with esbuild and copies static renderer files into dist/.
import { build } from 'esbuild';
import { cpSync, mkdirSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'dist');
const watch = process.argv.includes('--watch');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'renderer'), { recursive: true });

const common = { bundle: true, sourcemap: true, logLevel: 'info', target: 'es2023' };

await Promise.all([
  build({
    ...common,
    entryPoints: [join(root, 'src/main/main.ts')],
    outfile: join(dist, 'main/main.js'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  }),
  build({
    ...common,
    entryPoints: [join(root, 'src/preload/preload.ts')],
    outfile: join(dist, 'preload/preload.js'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  }),
  build({
    ...common,
    // Every top-level src/renderer/*.ts is an entry point (overlay.ts, dashboard.ts, ...).
    entryPoints: readdirSync(join(root, 'src/renderer'))
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
      .map((f) => join(root, 'src/renderer', f)),
    outdir: join(dist, 'renderer'),
    platform: 'browser',
    format: 'iife',
  }),
]);

// Copy static renderer assets (html, css, images, fonts) as-is, preserving subfolders.
const STATIC = new Set(['.html', '.css', '.svg', '.png', '.woff', '.woff2', '.ttf', '.json']);
function copyStatic(src, dst) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    if (entry.isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyStatic(s, d);
    } else if (STATIC.has(extname(entry.name))) {
      cpSync(s, d);
    }
  }
}
copyStatic(join(root, 'src/renderer'), join(dist, 'renderer'));
if (existsSync(join(root, 'assets'))) cpSync(join(root, 'assets'), join(dist, 'assets'), { recursive: true });

if (watch) console.log('watch mode is not implemented; re-run npm run build');
