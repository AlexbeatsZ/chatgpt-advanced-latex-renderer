/**
 * Where to look and what to skip. Selectors are ordered from the most semantic (role/data
 * attributes) to generic fallbacks; hashed CSS-module class names are never used.
 */
import { OWN_SELECTOR } from './katex';

export type Author = 'assistant' | 'user' | 'unknown';

const ASSISTANT_SELECTORS = [
  '[data-message-author-role="assistant"]',
  '[data-content-search-unit-key$=":assistant"]',
  '[data-chatgpt-search-unit-key$=":assistant"]',
  '[data-markdown-text-style="assistant-message"]',
];
const USER_SELECTORS = [
  '[data-message-author-role="user"]',
  '[data-content-search-unit-key$=":user"]',
  '[data-chatgpt-search-unit-key$=":user"]',
];

export const MESSAGE_SELECTOR = [...ASSISTANT_SELECTORS, ...USER_SELECTORS].join(',');

/** Regions whose text must never be treated as math, and that math cannot span. */
export const EXCLUDED_SELECTOR = [
  'pre', 'code', 'kbd', 'samp', 'textarea', 'input', 'select', 'button', 'script', 'style', 'svg',
  '.cm-editor', '[contenteditable=""]', '[contenteditable="true"]', '[contenteditable="plaintext-only"]',
  '.katex', '.katex-display', '.katex-error', 'mjx-container', 'math', OWN_SELECTOR, '[data-alr-skip]',
].join(',');

export function authorOf(el: Element): Author {
  if (el.closest(ASSISTANT_SELECTORS.join(','))) return 'assistant';
  if (el.closest(USER_SELECTORS.join(','))) return 'user';
  return 'unknown';
}

/**
 * Top-level message containers inside `root` (or containing `root`). Returns the outermost
 * match so nested markers (e.g. a markdown root inside a turn) are not processed twice.
 */
export function messageRoots(root: ParentNode, includeUser: boolean): Element[] {
  const sel = includeUser ? MESSAGE_SELECTOR : ASSISTANT_SELECTORS.join(',');
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
