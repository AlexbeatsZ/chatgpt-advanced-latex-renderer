import { browserAdaptor } from '@mathjax/src/mjs/adaptors/browserAdaptor.js';
import { TexEngine, type EngineConfig, type FontLoader } from './engine';

/** Creates a MathJax engine on the live document with the given dynamic-font loader. */
export function createDomEngine(cfg: EngineConfig, loadFont: FontLoader): TexEngine<HTMLElement> {
  return new TexEngine<HTMLElement>(browserAdaptor(), document, cfg, loadFont);
}

export type EngineFactory = (cfg: EngineConfig) => TexEngine<HTMLElement>;
