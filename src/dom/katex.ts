/**
 * Locating formulas already rendered by the page, recovering their TeX source and
 * detecting silent failures. See docs/design/chatgpt-dom.md ("源码恢复优先级", "失败检测").
 */
import { commandsIn } from '../tex/braces';

/** Our rendered formulas and our clones of raw-text blocks. */
export const OWN_SELECTOR = 'alr-math, [data-alr-clone]';
/** Formulas inside these are not processed (ours, or a hidden original whose clone is shown). */
const SKIP_UNITS = 'alr-math, [data-alr-raw-hidden]';

/** The outermost element of one rendered formula: `.katex-display` or a standalone `.katex`. */
export function findRenderedUnits(root: ParentNode): Element[] {
  const out: Element[] = [];
  root.querySelectorAll('.katex-display, .katex, mjx-container').forEach((el) => {
    if (el.closest(SKIP_UNITS)) return;
    if (el.matches('.katex') && el.parentElement?.closest('.katex-display')) return;
    if (el.matches('mjx-container') && el.parentElement?.closest('mjx-container')) return;
    if (el.parentElement?.closest('.katex')) return; // nested inside another formula
    out.push(el);
  });
  return out;
}

export function isDisplayUnit(unit: Element): boolean {
  if (unit.matches('.katex-display')) return true;
  if (unit.matches('mjx-container')) return unit.getAttribute('display') === 'true';
  return false;
}

const SOURCE_ATTRS = ['data-latex', 'data-tex', 'data-math', 'data-formula'];

/** Recovers the original TeX, or null if it is not present in the DOM. Never reverse-engineers glyphs. */
export function getTexSource(unit: Element): string | null {
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
    unit.querySelectorAll('.katex-html [style*="color"]').forEach((el) => {
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

/** True if the TeX uses any command from `preferred` (names without backslash). */
export function usesPreferred(tex: string, preferred: ReadonlySet<string>): boolean {
  if (!preferred.size) return false;
  for (const c of commandsIn(tex)) if (preferred.has(c)) return true;
  return false;
}
