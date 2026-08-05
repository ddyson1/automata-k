import { defineConfig } from 'vite';

/**
 * The web app is plain TypeScript against the DOM. It imports the engine from
 * ../src/engine, which is why the dev server is allowed to read one level up.
 *
 * `base: './'` keeps the built bundle relative, so dist/ works from any path a
 * host happens to serve it from rather than only from the domain root.
 */
export default defineConfig({
  root: __dirname,
  base: './',
  server: {
    fs: { allow: ['..'] },
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        // One JS chunk and one CSS chunk keeps the single-file build trivial.
        manualChunks: undefined,
      },
    },
  },
});
