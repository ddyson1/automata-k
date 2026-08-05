/**
 * Fold the built web app into one self-contained HTML file.
 *
 * The app already makes no network calls, so the only thing standing between
 * `web/dist` and a single file is the handful of local assets the bundler split
 * out. Inlining them makes the whole game something you can email, drop on a
 * USB stick, or open with file:// and no server at all.
 *
 *     npm run build:single      ->  web/dist/automata-k.html
 */

import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'web', 'dist');
const ASSETS = join(DIST, 'assets');

if (!existsSync(DIST)) {
  console.error('web/dist not found. Run npm run build first.');
  process.exit(1);
}

const files = readdirSync(ASSETS);
const jsFile = files.find((f) => f.endsWith('.js'));
const cssFile = files.find((f) => f.endsWith('.css'));
if (!jsFile || !cssFile) {
  console.error('expected one js and one css chunk in web/dist/assets');
  process.exit(1);
}

/** Rewrite url(...) references to the fonts as data URIs. */
function inlineFonts(css) {
  return css.replace(/url\(["']?([^"')]+\.woff2)["']?\)/g, (_, ref) => {
    const name = ref.split('/').pop();
    const bytes = readFileSync(join(ASSETS, name));
    return `url(data:font/woff2;base64,${bytes.toString('base64')})`;
  });
}

const css = inlineFonts(readFileSync(join(ASSETS, cssFile), 'utf8'));
const js = readFileSync(join(ASSETS, jsFile), 'utf8');

const source = readFileSync(join(DIST, 'index.html'), 'utf8');
const head = source.slice(source.indexOf('<head>') + 6, source.indexOf('</head>'));
// Drop the tags that pointed at the split-out files; their contents are inlined below.
const meta = head.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<link[^>]*rel="stylesheet"[^>]*>/g, '');

const html = `<!doctype html>
<html lang="en">
<head>
${meta.trim()}
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<script type="module">
${js}
</script>
</body>
</html>
`;

const out = join(DIST, 'automata-k.html');
writeFileSync(out, html);
console.log(`  ${out}`);
console.log(`  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)}MB, one file, no requests`);
