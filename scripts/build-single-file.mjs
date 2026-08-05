/**
 * Fold the exported web build into one self-contained HTML file.
 *
 * Useful for sharing a playable build somewhere that serves a single document
 * and blocks external requests. Run `npm run build:web` first.
 *
 *   node scripts/build-single-file.mjs [outfile]
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const out = process.argv[2] ?? 'dist/automata-lab.html';

const jsDir = join(DIST, '_expo/static/js/web');
const bundles = readdirSync(jsDir).filter((f) => f.endsWith('.js'));
if (bundles.length !== 1) {
  throw new Error(
    `expected exactly one web bundle, found ${bundles.length}: ${bundles.join(', ')}`,
  );
}

const bundle = readFileSync(join(jsDir, bundles[0]), 'utf8');
const reset = readFileSync(join(DIST, 'index.html'), 'utf8').match(
  /<style id="expo-reset">([\s\S]*?)<\/style>/,
);

// A closing script tag inside the bundle would end the inline script early.
const safe = bundle.replaceAll('</script', '<\\/script');

const html = `<style id="expo-reset">${reset ? reset[1] : ''}
  html, body { background: #E9EBEF; }
  @media (prefers-color-scheme: dark) { html, body { background: #14171D; } }
</style>
<div id="root"></div>
<script>
  // The router reads window.location on boot, and this file can be served from
  // any path. Boot it at the root so it starts on the level list rather than
  // the unmatched route, then put the real address back and stop the router
  // from writing to it again. Reloading therefore always returns here, to the
  // level list, with progress intact. The cost is deep links and the browser
  // back button; the in-app Levels button still works.
  (function () {
    var here = window.location.pathname + window.location.search + window.location.hash;
    if (window.location.pathname === '/') return;
    try {
      window.history.replaceState(null, '', '/');
    } catch (e) {
      return; // Some embeddings deny history access. The app still boots.
    }
    window.addEventListener('load', function () {
      setTimeout(function () {
        var replace = window.history.replaceState.bind(window.history);
        window.history.pushState = function () {};
        window.history.replaceState = function () {};
        try {
          replace(null, '', here);
        } catch (e) {
          /* nothing to do, the app is already running */
        }
      }, 0);
    });
  })();
</script>
<script>${safe}</script>
`;

writeFileSync(out, html);
const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(2);
console.log(`wrote ${out} (${mb} MB) from ${bundles[0]}`);
