import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fontDir = path.join(path.dirname(require.resolve('@mathjax/mathjax-newcm-font/package.json')), 'mjs/svg/dynamic');
// One entry per MathJax dynamic font range -> dist/content/fonts/<name>.js (loaded by URL on demand).
const fontEntries = Object.fromEntries(
  fs.readdirSync(fontDir).filter((f) => f.endsWith('.js')).map((f) => [`content/fonts/${f.slice(0, -3)}`, path.join(fontDir, f)]),
);

// Builds an unpacked MV3 extension into dist/.
// - content/main.js is an ES module imported by public/content-loader.js; MathJax and each
//   font range become separate chunks loaded on demand from the extension (no CDN).
// - modulePreload is disabled: Vite's preload helper would inject <link> tags into the page.
// - entry chunks are not tree-shaken of exports (preserveEntrySignatures) so engine.js keeps its API.
export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    modulePreload: false,
    sourcemap: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      preserveEntrySignatures: 'strict',
      input: {
        'content/main': 'src/content/main.ts',
        // Separate entry with a fixed name, imported at runtime via chrome.runtime.getURL so the
        // content script carries no bundler preload helper.
        'content/engine': 'src/render/browserEngine.ts',
        ...fontEntries,
        popup: 'popup.html',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
