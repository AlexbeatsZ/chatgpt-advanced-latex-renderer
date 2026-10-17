import type { EngineConfig } from './engine';
import { createDomEngine } from './domEngine';

/**
 * Extension build: its own entry (dist/content/engine.js), loaded lazily by the content script the
 * first time a formula needs MathJax. Font ranges are separate entries (dist/content/fonts/*.js)
 * loaded by URL, so nothing is fetched from a CDN and no bundler preload helper is involved.
 */
export function createBrowserEngine(cfg: EngineConfig) {
  return createDomEngine(cfg, (name) => import(/* @vite-ignore */ chrome.runtime.getURL(`content/fonts/${name}.js`)));
}
