/**
 * Where to look and what to skip. Message selectors come from the current site's entry in
 * src/sites/sites.ts (semantic / data attributes first; hashed CSS-module class names avoided).
 */
import { OWN_SELECTOR } from './katex';
import { type Site, selectorsFor, siteFor, SITES } from '../sites/sites';

export type Author = 'assistant' | 'user' | 'unknown';

let assistantSel = '';
let userSel = '';
let messageSel = '';
let current: Site = SITES[0];

/** Keeps only selectors the browser accepts: one bad entry would invalidate the whole list. */
function valid(list: string[]): string[] {
  return list.filter((s) => {
    try {
      document.createDocumentFragment().querySelector(s);
      return true;
    } catch {
      return false;
    }
  });
}

/** Selects the site profile used by messageRoots/authorOf (default: from the current location). */
export function configureSite(site: Site = siteFor(location.hostname, location.pathname)): Site {
  current = site;
  const sel = selectorsFor(site);
  const a = valid(sel.assistant);
  const u = valid(sel.user);
  assistantSel = a.join(',');
  userSel = u.join(',');
  messageSel = [...a, ...u].join(',');
  return site;
}

export function currentSite(): Site {
  if (!messageSel) configureSite();
  return current;
}

/** Regions whose text must never be treated as math, and that math cannot span. */
export const EXCLUDED_SELECTOR = [
  'pre', 'code', 'kbd', 'samp', 'textarea', 'input', 'select', 'button', 'script', 'style', 'svg',
  '.cm-editor', '[contenteditable=""]', '[contenteditable="true"]', '[contenteditable="plaintext-only"]',
  '.katex', '.katex-display', '.katex-error', 'mjx-container', 'math', '[data-math-source]', OWN_SELECTOR, '[data-alr-skip]',
].join(',');

export function authorOf(el: Element): Author {
  currentSite();
  if (assistantSel && el.closest(assistantSel)) return 'assistant';
  if (userSel && el.closest(userSel)) return 'user';
  return 'unknown';
}

/**
 * Top-level message containers inside `root` (or containing `root`). Returns the outermost
 * match so nested markers (e.g. a markdown root inside a turn) are not processed twice.
 */
export function messageRoots(root: ParentNode, includeUser: boolean): Element[] {
  currentSite();
  const sel = includeUser ? messageSel : assistantSel;
  if (!sel) return [];
  const set = new Set<Element>();
  if (root instanceof Element) {
    const up = root.closest(sel);
    if (up) set.add(outermost(up, sel));
  }
  root.querySelectorAll(sel).forEach((el) => set.add(outermost(el, sel)));
  return [...set];
}

function outermost(el: Element, sel: string): Element {
  let cur = el;
  let p = el.parentElement?.closest(sel);
  while (p) {
    cur = p;
    p = p.parentElement?.closest(sel);
  }
  return cur;
}

/** The composer / any element being edited by the user. */
export function isEditing(el: Element): boolean {
  return !!el.closest('textarea, [contenteditable=""], [contenteditable="true"], form');
}
