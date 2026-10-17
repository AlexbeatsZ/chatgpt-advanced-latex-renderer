import { browserAdaptor } from '@mathjax/src/mjs/adaptors/browserAdaptor.js';
import { TexEngine, type EngineConfig } from './engine';

/**
 * Built as its own entry (dist/content/engine.js) and loaded lazily by the content script the
 * first time a formula needs MathJax. Font ranges are separate entries (dist/content/fonts/*.js)
 * loaded by URL, so nothing is fetched from a CDN and no bundler preload helper is involved.
 */
export function createBrowserEngine(cfg: EngineConfig): TexEngine<HTMLElement> {
  return new TexEngine<HTMLElement>(browserAdaptor(), document, cfg, (name) =>
    import(/* @vite-ignore */ chrome.runtime.getURL(`content/fonts/${name}.js`)),
  );
}
