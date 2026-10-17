// Bundles tests/real/probe-entry.ts into test-results/probe.js (IIFE exposing window.ALRProbe).
import { build } from 'vite';
await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    outDir: 'test-results/probe',
    emptyOutDir: true,
    minify: true,
    lib: { entry: 'tests/real/probe-entry.ts', formats: ['iife'], name: 'ALRProbe', fileName: () => 'probe.js' },
  },
});
console.log('built test-results/probe/probe.js');
