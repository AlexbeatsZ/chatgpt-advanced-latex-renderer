/**
 * Orchestrates discovery -> rendering -> DOM application for the ChatGPT page.
 * Read docs/design/chatgpt-dom.md before changing how the DOM is modified.
 */
import type { TexEngine } from '../render/engine';
import type * as BrowserEngine from '../render/browserEngine';
import { type Settings, parseCommandList } from '../shared/settings';
import type { FormulaError, Status } from '../shared/messages';
import { parseMacros } from '../tex/macros';
import { preprocessTex } from '../tex/preprocess';
import type { MathSegment, ScanOptions } from '../tex/delimiters';
import { detectFailure, findRenderedUnits, getTexSource, isDisplayUnit, usesPreferred, UNIT_SELECTOR } from '../dom/katex';
import { authorOf, messageRoots } from '../dom/scope';
import {
  applyBlock, collectText, findRawBlocks, forgetDetached, isUpToDate, restoreAllBlocks, restoreBlock, scanBlock, stateOf, BLOCK_SELECTOR,
} from '../dom/rawText';
import { BatchedObserver } from './observer';

type Engine = TexEngine<HTMLElement>;
type Rendered = { ok: true; node: HTMLElement } | { ok: false; error: string };

const CACHE_LIMIT = 3000;
const ERROR_LIMIT = 50;
const ATTRS = ['data-alr-hidden', 'data-alr-state', 'data-alr-error', 'data-alr-tex', 'data-alr-copied'];

export class Controller {
  private settings!: Settings;
  private engine: Promise<Engine> | null = null;
  private engineState: Status['engine'] = 'idle';
  private engineError?: string;
  private mathjaxVersion?: string;
  private observer = new BatchedObserver((dirty) => this.onDirty(dirty));
  private io: IntersectionObserver | null = null;
  private cache = new Map<string, Rendered>();
  /** our node -> the page node it stands in for */
  private links = new WeakMap<Element, Element>();
  private queue = new Set<Element>();
  private draining = false;
  private errors: FormulaError[] = [];
  private macroNames = new Set<string>();
  private macroErrors: string[] = [];
  private preferred = new Set<string>();
  private lastPassMs = 0;
  private urlTimer: ReturnType<typeof setInterval> | null = null;
  private lastUrl = location.href;
  private active = false;

  async init(settings: Settings) {
    this.settings = settings;
    this.computeDerived();
    document.addEventListener('click', (e) => this.onClick(e), true);
    if (settings.enabled) this.enable();
  }

  /* ------------------------------------------------------------ lifecycle */

  private enable() {
    if (this.active) return;
    this.active = true;
    this.io = new IntersectionObserver((entries) => this.onIntersect(entries), { rootMargin: '1200px 0px' });
    this.observer.start(document.body);
    this.urlTimer = setInterval(() => {
      if (location.href !== this.lastUrl) {
        this.lastUrl = location.href;
        setTimeout(() => this.fullScan(), 400);
      }
    }, 1000);
    this.fullScan();
  }

  private disable() {
    if (!this.active) return;
    this.active = false;
    this.observer.stop();
    this.io?.disconnect();
    this.io = null;
    this.queue.clear();
    if (this.urlTimer) clearInterval(this.urlTimer);
    this.restoreAll();
  }

  applySettings(next: Settings) {
    const prev = this.settings;
    this.settings = next;
    this.computeDerived();
    if (!next.enabled) return this.disable();
    const engineChanged = prev.macrosText !== next.macrosText || prev.physicsOverridesStandard !== next.physicsOverridesStandard;
    if (engineChanged) this.engine = null;
    const renderChanged = engineChanged || prev.scale !== next.scale || prev.smartBraket !== next.smartBraket || prev.siunitx !== next.siunitx;
    if (renderChanged) this.cache.clear();
    if (!prev.enabled || !this.active) return this.enable();
    this.rerender();
  }

  rerender() {
    if (!this.active) return;
    this.restoreAll();
    this.fullScan();
  }

  private computeDerived() {
    const parsed = parseMacros(this.settings.macrosText);
    this.macroNames = new Set(Object.keys(parsed.macros));
    this.macroErrors = parsed.errors;
    this.preferred = new Set([...parseCommandList(this.settings.preferCommands), ...this.macroNames]);
  }

  private getEngine(): Promise<Engine> {
    if (!this.engine) {
      this.engineState = 'loading';
      const cfg = { macros: parseMacros(this.settings.macrosText).macros, physicsOverridesStandard: this.settings.physicsOverridesStandard };
      this.engine = loadEngineModule()
        .then((m) => {
          const engine = m.createBrowserEngine(cfg);
          this.installStyles(engine);
          this.engineState = 'ready';
          this.engineError = undefined;
          this.mathjaxVersion = engine.version;
          return engine;
        })
        .catch((e) => {
          this.engineState = 'error';
          this.engineError = String(e?.message ?? e);
          this.engine = null;
          throw e;
        });
    }
    return this.engine;
  }

  private installStyles(engine: Engine) {
    const css = engine.styleSheetText();
    this.observer.mutate(() => {
      let style = document.getElementById('alr-mathjax-style') as HTMLStyleElement | null;
      if (!style) {
        style = document.createElement('style');
        style.id = 'alr-mathjax-style';
        (document.head ?? document.documentElement).appendChild(style);
      }
      style.textContent = css;
      if (!style.sheet) {
        // Inline <style> blocked (e.g. by a page CSP): fall back to a constructed stylesheet.
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
      }
    });
  }

  /* -------------------------------------------------------------- scanning */

  private fullScan() {
    if (!this.active) return;
    this.gc();
    this.scanRoots(this.rootsFor(document.body));
  }

  private onDirty(dirty: Set<Element>) {
    if (!this.active) return;
    this.gc();
    const roots = new Set<Element>();
    for (const el of dirty) if (el.isConnected) for (const r of this.rootsFor(el)) roots.add(r);
    this.scanRoots(roots);
  }

  /** Message containers for an element; falls back to <main>/the element when no marker is known. */
  private rootsFor(el: Element): Element[] {
    const roots = messageRoots(el, true).filter((r) => this.settings.userMessages || authorOf(r) !== 'user');
    if (roots.length) return roots;
    if (messageRoots(el, true).length) return []; // only user messages, and those are disabled
    const main = el.closest('main') ?? (el === document.body ? document.querySelector('main') : null);
    return [main ?? el];
  }

  private scanRoots(roots: Iterable<Element>) {
    const t0 = performance.now();
    const opts = this.scanOptions();
    for (const root of roots) {
      for (const unit of findRenderedUnits(root)) this.considerKatex(unit);
      if (this.settings.scanRawText) for (const block of findRawBlocks(root)) this.considerRaw(block, opts);
    }
    this.lastPassMs = performance.now() - t0;
  }

  private scanOptions(): ScanOptions {
    return { singleDollar: this.settings.singleDollar, doubleDollar: true, parens: true, brackets: true, environments: true };
  }

  private considerKatex(unit: Element) {
    if (unit.hasAttribute('data-alr-hidden')) {
      const ours = unit.nextElementSibling;
      if (ours && ours.tagName === 'ALR-MATH' && this.links.get(ours) === unit && ours.getAttribute('data-alr-tex') === getTexSource(unit)) return;
      this.observer.mutate(() => {
        if (ours && this.links.get(ours) === unit) ours.remove();
        unit.removeAttribute('data-alr-hidden');
      });
    }
    const tex = getTexSource(unit);
    if (!tex) return;
    if (unit.getAttribute('data-alr-state') === 'error' && unit.getAttribute('data-alr-tex') === tex) return;
    const want = this.settings.mode === 'full' || detectFailure(unit).failed || usesPreferred(tex, this.preferred);
    if (want) this.enqueue(unit, false);
  }

  private considerRaw(block: Element, opts: ScanOptions) {
    if (stateOf(block)) {
      // Already rendered: redo only if the page changed the text (streaming, React re-render).
      if (!isUpToDate(block)) this.enqueue(block, true);
      return;
    }
    if (scanBlock(block, opts).segments.length) this.enqueue(block, false);
  }

  private enqueue(el: Element, immediate: boolean) {
    if (immediate || !this.io) {
      this.queue.add(el);
      this.drain();
    } else {
      this.io.observe(el);
    }
  }

  private onIntersect(entries: IntersectionObserverEntry[]) {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      this.io?.unobserve(e.target);
      this.queue.add(e.target);
    }
    this.drain();
  }

  private async drain() {
    if (this.draining) return;
    this.draining = true;
    try {
      let slice = performance.now();
      while (this.queue.size && this.active) {
        const el = this.queue.values().next().value as Element;
        this.queue.delete(el);
        if (!el.isConnected) continue;
        try {
          if (el.matches(UNIT_SELECTOR)) await this.processKatex(el);
          else await this.processRaw(el);
        } catch (e) {
          console.warn('[ALR] processing failed', e);
        }
        if (performance.now() - slice > 30) {
          await new Promise((r) => setTimeout(r, 0)); // keep the page responsive
          slice = performance.now();
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /* ------------------------------------------------------------ rendering */

  private async render(tex: string, display: boolean, ctx: Element): Promise<Rendered> {
    const key = `${display ? 'D' : 'I'}\u0000${tex}`;
    const hit = this.cache.get(key);
    if (hit) return hit.ok ? { ok: true, node: hit.node.cloneNode(true) as HTMLElement } : hit;
    const engine = await this.getEngine();
    const prepared = preprocessTex(tex, { smartBraket: this.settings.smartBraket, siunitx: this.settings.siunitx, exclude: this.macroNames });
    const r = (await engine.render(prepared, display, this.metrics(ctx))) as Rendered;
    if (this.cache.size >= CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, r);
    return r.ok ? { ok: true, node: r.node.cloneNode(true) as HTMLElement } : r;
  }

  private metrics(ctx: Element) {
    const host = (ctx.parentElement ?? ctx) as HTMLElement;
    const em = (parseFloat(getComputedStyle(host).fontSize) || 16) * (this.settings.scale / 100);
    const block = (ctx.closest(BLOCK_SELECTOR + ', div') as HTMLElement | null) ?? host;
    return { em, ex: em / 2, containerWidth: Math.max(200, block.clientWidth || 700) };
  }

  private makeMath(node: HTMLElement, tex: string, display: boolean, source: 'katex' | 'text'): HTMLElement {
    const el = document.createElement('alr-math');
    el.setAttribute('data-alr-display', display ? 'block' : 'inline');
    el.setAttribute('data-alr-src', source);
    el.setAttribute('data-alr-tex', tex);
    el.style.fontSize = `${this.settings.scale}%`;
    node.setAttribute('aria-label', tex);
    el.appendChild(node);
    // Invisible copy of the source so that selecting and copying text yields LaTeX.
    const copy = document.createElement('span');
    copy.className = 'alr-copy';
    copy.textContent = display ? `$$${tex}$$` : `$${tex}$`;
    el.appendChild(copy);
    return el;
  }

  private async processKatex(unit: Element) {
    const tex = getTexSource(unit);
    if (!tex || unit.hasAttribute('data-alr-hidden')) return;
    const display = isDisplayUnit(unit);
    const r = await this.render(tex, display, unit);
    if (!unit.isConnected || getTexSource(unit) !== tex) return; // changed while rendering
    this.observer.mutate(() => {
      if (r.ok) {
        const el = this.makeMath(r.node, tex, display, 'katex');
        unit.after(el);
        this.links.set(el, unit);
        unit.setAttribute('data-alr-hidden', '');
        unit.removeAttribute('data-alr-state');
        unit.removeAttribute('data-alr-error');
      } else {
        unit.setAttribute('data-alr-state', 'error');
        unit.setAttribute('data-alr-tex', tex);
        unit.setAttribute('data-alr-error', r.error);
        this.recordError(tex, r.error, 'katex');
      }
    });
  }

  private async processRaw(block: Element) {
    const { map, segments } = scanBlock(block, this.scanOptions());
    if (!segments.length) {
      if (stateOf(block)) this.observer.mutate(() => restoreBlock(block));
      return;
    }
    const results = new Map<string, Rendered>();
    for (const seg of segments) {
      const key = segKey(seg);
      if (!results.has(key)) results.set(key, await this.render(seg.tex, seg.display, block));
    }
    if (!block.isConnected || collectText(block).text !== map.text) return; // still streaming: next batch handles it
    for (const seg of segments) {
      const r = results.get(segKey(seg))!;
      if (!r.ok) this.recordError(seg.tex, r.error, 'text');
    }
    this.observer.mutate(() =>
      applyBlock(block, map.text, segments, (seg) => {
        const r = results.get(segKey(seg))!;
        if (r.ok) return this.makeMath(r.node.cloneNode(true) as HTMLElement, seg.tex, seg.display, 'text');
        // Keep the source visible, marked, with the error on hover. <alr-text> is ours, so it
        // is skipped by text collection and removed on restore.
        const span = document.createElement('alr-text');
        span.className = 'alr-raw-error';
        span.title = `LaTeX 错误: ${r.error}`;
        span.textContent = map.text.slice(seg.start, seg.end);
        return span;
      }),
    );
  }

  private recordError(tex: string, message: string, source: 'katex' | 'text') {
    if (this.errors.some((e) => e.tex === tex && e.message === message)) return;
    this.errors.unshift({ tex, message, source, time: Date.now() });
    if (this.errors.length > ERROR_LIMIT) this.errors.length = ERROR_LIMIT;
  }

  /* ------------------------------------------------------------ cleanup */

  /** Removes MathJax nodes whose KaTeX counterpart disappeared or moved (React re-render). */
  private gc() {
    forgetDetached();
    const orphans: Element[] = [];
    document.querySelectorAll('alr-math[data-alr-src="katex"]').forEach((el) => {
      const orig = this.links.get(el);
      if (!orig || !orig.isConnected || orig.nextElementSibling !== el) orphans.push(el);
    });
    if (orphans.length) this.observer.mutate(() => orphans.forEach((el) => el.remove()));
  }

  restoreAll() {
    this.observer.mutate(() => {
      restoreAllBlocks();
      document.querySelectorAll('alr-math, alr-text').forEach((el) => el.remove());
      document.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(',')).forEach((el) => ATTRS.forEach((a) => el.removeAttribute(a)));
    });
    this.io?.disconnect();
    if (this.active) this.io = new IntersectionObserver((entries) => this.onIntersect(entries), { rootMargin: '1200px 0px' });
    this.queue.clear();
  }

  /* --------------------------------------------------------- interaction */

  private onClick(e: MouseEvent) {
    if (!e.altKey || !this.settings.altClickCopy || !this.settings.enabled) return;
    const target = e.target as Element | null;
    const ours = target?.closest?.('alr-math');
    const native = ours ? null : target?.closest?.('.katex-display, .katex, .katex-error');
    const tex = ours?.getAttribute('data-alr-tex') ?? (native ? getTexSource(native) : null);
    if (!tex) return;
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(tex).then(
      () => flash(ours ?? native!),
      () => undefined,
    );
  }

  status(): Status {
    const units = findRenderedUnits(document);
    return {
      engine: this.engineState,
      engineError: this.engineError,
      mathjaxVersion: this.mathjaxVersion,
      enabled: this.settings.enabled,
      mode: this.settings.mode,
      counts: {
        katexSeen: units.length,
        upgraded: document.querySelectorAll('alr-math[data-alr-src="katex"]').length,
        rawRendered: document.querySelectorAll('alr-math[data-alr-src="text"]').length,
        errors: this.errors.length,
        noSource: units.filter((u) => !getTexSource(u)).length,
      },
      lastPassMs: Math.round(this.lastPassMs * 10) / 10,
      errors: this.errors.slice(0, 20),
      macroErrors: this.macroErrors,
    };
  }

  async validateMacros(text: string): Promise<string[]> {
    const parsed = parseMacros(text);
    if (parsed.errors.length) return parsed.errors;
    const { createBrowserEngine } = await loadEngineModule();
    const engine = createBrowserEngine({ macros: parsed.macros, physicsOverridesStandard: this.settings.physicsOverridesStandard });
    return engine.validateMacros(Object.keys(parsed.macros));
  }
}

/** MathJax lives in its own entry (dist/content/engine.js), loaded only when first needed. */
function loadEngineModule(): Promise<typeof BrowserEngine> {
  return import(/* @vite-ignore */ chrome.runtime.getURL('content/engine.js'));
}

function segKey(seg: MathSegment): string {
  return `${seg.display ? 'D' : 'I'}\u0000${seg.tex}`;
}

function flash(el: Element) {
  el.setAttribute('data-alr-copied', '');
  setTimeout(() => el.removeAttribute('data-alr-copied'), 700);
}
