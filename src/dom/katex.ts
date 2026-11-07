/**
 * Locating formulas already rendered by the page, recovering their TeX source and
 * detecting silent failures. See docs/design/chatgpt-dom.md ("源码恢复优先级", "失败检测").
 */
import { commandsIn } from '../tex/braces';

/** Nodes created by this extension. */
export const OWN_SELECTOR = 'alr-math, alr-text';

/**
 * Some pages wrap each formula in an element that carries its source, e.g. ChatGPT's newer
 * `<span role="math" data-math-source="..." data-client-katex-layout>` (KaTeX HTML-only output,
 * no MathML annotation). The wrapper is then the unit we hide and stand in for.
 */
export const HOST_SELECTOR = '[data-math-source]';

export const UNIT_SELECTOR = `.katex-display, .katex, .katex-error, mjx-container, ${HOST_SELECTOR}`;

/**
 * The outermost element of one rendered formula: a source-carrying wrapper (HOST_SELECTOR),
 * `.katex-display`, a standalone `.katex`, a KaTeX parse-error span (`.katex-error`, whose text is
 * the TeX source) or `mjx-container`.
 */
export function findRenderedUnits(root: ParentNode): Element[] {
  const out: Element[] = [];
  root.querySelectorAll(UNIT_SELECTOR).forEach((el) => {
    if (el.closest(OWN_SELECTOR)) return;
    if (el.parentElement?.closest(HOST_SELECTOR)) return; // the wrapper is the unit
    if (el.matches(HOST_SELECTOR)) {
      if (!el.getAttribute('data-math-source')?.trim()) return;
      if (el.parentElement?.closest('.katex, mjx-container')) return;
      out.push(el);
      return;
    }
    if ((el.matches('.katex') || el.matches('.katex-error')) && el.parentElement?.closest('.katex-display')) return;
    if (el.matches('mjx-container') && el.parentElement?.closest('mjx-container')) return;
    if (el.parentElement?.closest('.katex')) return; // nested inside another formula
    out.push(el);
  });
  return out;
}

export function isDisplayUnit(unit: Element): boolean {
  if (unit.matches('.katex-display')) return true;
  if (unit.matches(HOST_SELECTOR)) {
    const d = unit.getAttribute('display') ?? unit.getAttribute('data-display');
    if (d) return d === 'block' || d === 'true';
    return !!unit.querySelector('.katex-display') || !!unit.parentElement?.closest('[data-d-block], .math-block');
  }
  if (unit.matches('.katex-error')) return !!unit.parentElement?.closest('[data-d-block], .katex-display, .math-block');
  if (unit.matches('mjx-container')) return unit.getAttribute('display') === 'true';
  return false;
}

const SOURCE_ATTRS = ['data-math-source', 'data-latex', 'data-tex', 'data-math', 'data-formula'];

/** Recovers the original TeX, or null if it is not present in the DOM. Never reverse-engineers glyphs. */
export function getTexSource(unit: Element): string | null {
  if (unit.matches(HOST_SELECTOR)) {
    const v = unit.getAttribute('data-math-source')?.trim();
    if (v) return stripDelimiters(v);
  }
  // KaTeX parse errors render the original TeX source as the span's text.
  if (unit.matches('.katex-error')) return unit.textContent?.trim() || null;
  const err = unit.querySelector(':scope > .katex-error');
  if (err && !unit.querySelector('annotation')) return err.textContent?.trim() || null;
  const ann = unit.querySelector(
    'annotation[encoding="application/x-tex"], annotation[encoding="application/x-latex"], annotation[encoding="TeX"]',
  );
  if (ann?.textContent?.trim()) return ann.textContent.trim();
  const script = unit.querySelector('script[type^="math/tex"]');
  if (script?.textContent?.trim()) return script.textContent.trim();
  // MathJax 4 puts data-latex on the top math node.
  const mjx = unit.matches('mjx-container') ? unit.querySelector('[data-latex]') : null;
  if (mjx) return mjx.getAttribute('data-latex')!.trim();
  let el: Element | null = unit;
  for (let depth = 0; el && depth < 3; depth++, el = el.parentElement) {
    for (const a of SOURCE_ATTRS) {
      const v = el.getAttribute(a);
      if (v && v.trim()) return stripDelimiters(v.trim());
    }
  }
  return null;
}

function stripDelimiters(s: string): string {
  const pairs: [string, string][] = [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']];
  for (const [a, b] of pairs) {
    if (s.startsWith(a) && s.endsWith(b) && s.length > a.length + b.length) return s.slice(a.length, -b.length).trim();
  }
  return s;
}

export interface FailureInfo {
  failed: boolean;
  /** Commands KaTeX could not handle (from its red error marks), e.g. ["ce"]. */
  commands: string[];
}

const RED = /^#?c00$|^#?cc0000$|^rgb\(\s*204\s*,\s*0\s*,\s*0\s*\)$/i;

/** Detects KaTeX hard errors (.katex-error) and silent undefined-command marks (red text). */
export function detectFailure(unit: Element): FailureInfo {
  if (unit.matches('.katex-error') || unit.querySelector('.katex-error')) return { failed: true, commands: [] };
  const commands = new Set<string>();
  let failed = false;
  unit.querySelectorAll('[mathcolor]').forEach((el) => {
    if (RED.test(el.getAttribute('mathcolor')!.trim())) {
      failed = true;
      const m = /^\\([a-zA-Z]+)/.exec(el.textContent ?? '');
      if (m) commands.add(m[1]);
    }
  });
  if (!failed) {
    // KaTeX's HTML side (also when the page renders HTML-only, without MathML).
    unit.querySelectorAll('[style*="color"]').forEach((el) => {
      const color = (el as HTMLElement).style?.color ?? '';
      if (RED.test(color.trim())) {
        failed = true;
        const m = /^\\([a-zA-Z]+)/.exec(el.textContent ?? '');
        if (m) commands.add(m[1]);
      }
    });
  }
  return { failed, commands: [...commands] };
}

/**
 * ChatGPT renders ```latex code blocks with a preview; when its renderer fails, the preview is an
 * alert ("LaTeX 代码无效") and the source survives only in the code block. Returns the direct
 * child of `[data-code-block-preview]` that holds the alert (the element we hide).
 */
export function findPreviewErrors(root: ParentNode): Element[] {
  const out: Element[] = [];
  root.querySelectorAll('[data-code-block-preview] aside[role="alert"]').forEach((aside) => {
    const preview = aside.closest('[data-code-block-preview]')!;
    let unit: Element = aside;
    while (unit.parentElement && unit.parentElement !== preview) unit = unit.parentElement;
    if (!unit.closest(OWN_SELECTOR)) out.push(unit);
  });
  return out;
}

/** Source of the code block a preview belongs to, if it looks like a LaTeX math snippet. */
export function getCodeBlockSource(unit: Element): string | null {
  const block = unit.closest('[data-code-block]');
  if (!block) return null;
  const src = block.getAttribute('data-markdown-copy-text') ?? block.querySelector('[data-code-block-source] .cm-content')?.textContent ?? null;
  if (!src || !/\\[a-zA-Z]/.test(src)) return null;
  if (/\\documentclass|\\begin\{document\}|\\usepackage/.test(src)) return null; // whole documents: out of scope
  return src;
}

/** True if the TeX uses any command from `preferred` (names without backslash). */
export function usesPreferred(tex: string, preferred: ReadonlySet<string>): boolean {
  if (!preferred.size) return false;
  for (const c of commandsIn(tex)) if (preferred.has(c)) return true;
  return false;
}
