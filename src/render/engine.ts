/**
 * MathJax 4 engine wrapper (TeX input -> SVG output), bundled at build time.
 * Environment-agnostic: the content script passes the browser adaptor, tests pass liteAdaptor.
 * See docs/design/mathjax-engine.md.
 */
import { mathjax } from '@mathjax/src/mjs/mathjax.js';
import { TeX } from '@mathjax/src/mjs/input/tex.js';
import { SVG } from '@mathjax/src/mjs/output/svg.js';
import { RegisterHTMLHandler } from '@mathjax/src/mjs/handlers/html.js';
import type { DOMAdaptor } from '@mathjax/src/mjs/core/DOMAdaptor.js';
import type { MathDocument } from '@mathjax/src/mjs/core/MathDocument.js';

import '@mathjax/src/mjs/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/mjs/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/mjs/input/tex/amscd/AmsCdConfiguration.js';
import '@mathjax/src/mjs/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/mjs/input/tex/configmacros/ConfigMacrosConfiguration.js';
import '@mathjax/src/mjs/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/mjs/input/tex/mhchem/MhchemConfiguration.js';
import '@mathjax/src/mjs/input/tex/braket/BraketConfiguration.js';
import '@mathjax/src/mjs/input/tex/physics/PhysicsConfiguration.js';
import '@mathjax/src/mjs/input/tex/mathtools/MathtoolsConfiguration.js';
import '@mathjax/src/mjs/input/tex/empheq/EmpheqConfiguration.js';
import '@mathjax/src/mjs/input/tex/cancel/CancelConfiguration.js';
import '@mathjax/src/mjs/input/tex/cases/CasesConfiguration.js';
import '@mathjax/src/mjs/input/tex/centernot/CenternotConfiguration.js';
import '@mathjax/src/mjs/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/mjs/input/tex/colortbl/ColortblConfiguration.js';
import '@mathjax/src/mjs/input/tex/bbox/BboxConfiguration.js';
import '@mathjax/src/mjs/input/tex/enclose/EncloseConfiguration.js';
import '@mathjax/src/mjs/input/tex/extpfeil/ExtpfeilConfiguration.js';
import '@mathjax/src/mjs/input/tex/gensymb/GensymbConfiguration.js';
import '@mathjax/src/mjs/input/tex/textcomp/TextcompConfiguration.js';
import '@mathjax/src/mjs/input/tex/textmacros/TextMacrosConfiguration.js';
import '@mathjax/src/mjs/input/tex/unicode/UnicodeConfiguration.js';
import '@mathjax/src/mjs/input/tex/units/UnitsConfiguration.js';
import '@mathjax/src/mjs/input/tex/upgreek/UpgreekConfiguration.js';
import '@mathjax/src/mjs/input/tex/bbm/BbmConfiguration.js';
import '@mathjax/src/mjs/input/tex/dsfont/DsfontConfiguration.js';
import '@mathjax/src/mjs/input/tex/verb/VerbConfiguration.js';
import '@mathjax/src/mjs/input/tex/begingroup/BegingroupConfiguration.js';

import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/mjs/svg.js';
// mhchem arrows/bonds live in a separate font extension in MathJax 4 (variant '-mhchem').
import { MathJaxMhchemFontExtension } from '@mathjax/mathjax-mhchem-font-extension/mjs/svg.js';
import type { MacroMap } from '../tex/macros';
import './standardFns'; // registers the 'alrstandard' TeX package

/**
 * When two packages define the same command, the one with the higher priority (lower number,
 * default 5) wins. braket ships with priority 3, which would beat physics for \bra \ket \braket,
 * so it is loaded with priority 10: physics owns those commands (braket-style \braket{a|b} is
 * rewritten by preprocessTex) and braket still provides \set \Set \Bra \Ket \Braket.
 * Deliberately NOT loaded: html/texhtml (raw HTML, links),
 * noerrors/noundefined (we need real errors to fall back to the page's rendering),
 * require/autoload (runtime loading).
 */
export const TEX_PACKAGES: (string | [string, number])[] = [
  'base', 'ams', 'amscd', 'newcommand', 'boldsymbol', 'mhchem', ['braket', 10], 'physics',
  'mathtools', 'empheq', 'cancel', 'cases', 'centernot', 'color', 'colortbl', 'bbox', 'enclose',
  'extpfeil', 'gensymb', 'textcomp', 'textmacros', 'unicode', 'units', 'upgreek', 'bbm', 'dsfont',
  'verb', 'begingroup', 'configmacros',
];

/**
 * 'alrstandard' (src/render/standardFns.ts) restores the standard meaning of the commands physics
 * redefines (\ln[...] power argument, \div, \Re, \Im, \sin...). Omitted when the user opts into
 * physics semantics.
 */
export function texPackages(physicsOverridesStandard: boolean): (string | [string, number])[] {
  return physicsOverridesStandard ? TEX_PACKAGES : [...TEX_PACKAGES, 'alrstandard'];
}

export interface EngineConfig {
  macros: MacroMap;
  physicsOverridesStandard: boolean;
}

export interface Metrics {
  em: number;
  ex: number;
  containerWidth: number;
}

export type RenderResult<N> = { ok: true; node: N } | { ok: false; error: string };

/** Loads one dynamic font range by its base name (e.g. "arrows"). */
export type FontLoader = (name: string) => Promise<unknown>;

let handlerRegistered = false;

function installLoader(loadFont: FontLoader) {
  mathjax.asyncLoad = (name: string) => {
    const file = name.replace(/^.*\//, '').replace(/\.js$/, '');
    if (!/^[a-zA-Z0-9-]+$/.test(file)) return Promise.reject(new Error(`MathJax requested unexpected file: ${name}`));
    return loadFont(file);
  };
}

export class TexEngine<N = unknown> {
  readonly adaptor: DOMAdaptor<any, any, any>;
  private doc: MathDocument<any, any, any>;
  private tex: TeX<any, any, any>;
  private lastError: string | null = null;

  constructor(adaptor: DOMAdaptor<any, any, any>, root: unknown, cfg: EngineConfig, loadFont: FontLoader) {
    this.adaptor = adaptor;
    if (!handlerRegistered) {
      RegisterHTMLHandler(adaptor);
      MathJaxNewcmFont.addExtension(MathJaxMhchemFontExtension as any);
      handlerRegistered = true;
    }
    installLoader(loadFont); // mathjax.asyncLoad is global: the latest engine's loader is used
    this.tex = new TeX({
      packages: texPackages(cfg.physicsOverridesStandard),
      macros: cfg.macros,
      tags: 'none',
      // Collect the message, then let MathJax build its normal error node.
      formatError: (jax: any, err: any) => {
        this.lastError = err?.message ?? String(err);
        return jax.formatError(err);
      },
    } as any);
    const svg = new SVG({
      fontData: MathJaxNewcmFont,
      fontCache: 'none', // self-contained SVGs: safe to clone, no shared <defs> ids
      linebreaks: { inline: false },
    } as any);
    this.doc = mathjax.document(root, { InputJax: this.tex, OutputJax: svg });
  }

  get version(): string {
    return mathjax.version;
  }

  async render(tex: string, display: boolean, metrics: Metrics): Promise<RenderResult<N>> {
    try {
      const node = await mathjax.handleRetriesFor(() => {
        this.lastError = null;
        this.tex.reset();
        return this.doc.convert(tex, {
          display,
          em: metrics.em,
          ex: metrics.ex,
          containerWidth: metrics.containerWidth,
        });
      });
      if (this.lastError) return { ok: false, error: this.lastError };
      return { ok: true, node: node as N };
    } catch (e) {
      return { ok: false, error: (e as Error)?.message ?? String(e) };
    }
  }

  /** CSS required by MathJax SVG output. */
  styleSheetText(): string {
    const sheet = (this.doc.outputJax as any).styleSheet(this.doc);
    return this.adaptor.textContent(sheet);
  }

  /** Checks user macros by compiling a formula that references each of them. */
  async validateMacros(names: string[]): Promise<string[]> {
    const errors: string[] = [];
    for (const name of names) {
      const r = await this.render(`\\${name}`, false, { em: 16, ex: 8, containerWidth: 800 });
      if (!r.ok && !/argument|Missing/i.test(r.error)) errors.push(`\\${name}: ${r.error}`);
    }
    return errors;
  }
}
