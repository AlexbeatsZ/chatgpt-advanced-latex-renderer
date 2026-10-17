/**
 * Copy handling for selections that include formulas rendered by this extension.
 *
 * ChatGPT (like KaTeX's copy-tex) rewrites copies by cloning the selected DOM and replacing each
 * `.katex` with its TeX - ignoring CSS. With our formulas on the page that clone contains the
 * hidden original KaTeX AND our MathJax node (with its invisible LaTeX helper), so formulas came
 * out two or three times. When a selection touches one of our nodes we build the clipboard
 * content ourselves: each formula exactly once, as $...$ (inline) or $$...$$ (display).
 * Selections without our nodes are left entirely to the page.
 */
import { getTexSource, isDisplayUnit } from '../dom/katex';

const BLOCK = new Set(['P', 'DIV', 'LI', 'UL', 'OL', 'TR', 'TABLE', 'BLOCKQUOTE', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'SECTION', 'ARTICLE', 'DD', 'DT', 'FIGURE']);

const wrap = (tex: string, display: boolean) => (display ? `\n$$${tex}$$\n` : `$${tex}$`);

/** True if the range touches any <alr-math>. */
export function rangeHasOurMath(range: Range): boolean {
  const c = range.commonAncestorContainer;
  const el = (c.nodeType === 1 ? c : c.parentElement) as Element | null;
  if (!el) return false;
  if (el.closest('alr-math')) return true;
  for (const m of el.querySelectorAll('alr-math')) if (range.intersectsNode(m)) return true;
  return false;
}

/**
 * Converts the selected content to a fragment where every formula is plain TeX text exactly once.
 * Works on a clone; the page is never modified.
 */
export function selectionFragment(range: Range): DocumentFragment {
  const doc = range.startContainer.ownerDocument!;
  // Selection entirely inside one of our formulas: copy that formula.
  const c = range.commonAncestorContainer;
  const inside = ((c.nodeType === 1 ? c : c.parentElement) as Element | null)?.closest('alr-math');
  if (inside) {
    const f = doc.createDocumentFragment();
    f.append(doc.createTextNode(wrap(inside.getAttribute('data-alr-tex') ?? '', inside.getAttribute('data-alr-display') === 'block').trim()));
    return f;
  }
  const frag = range.cloneContents();
  // Originals we hid (KaTeX replaced by MathJax, <br> inside a multi-line formula) are not content.
  frag.querySelectorAll('[data-alr-hidden]').forEach((e) => e.remove());
  // Our formulas -> TeX (data-alr-tex is kept on partially selected clones too).
  frag.querySelectorAll('alr-math').forEach((m) => {
    m.replaceWith(doc.createTextNode(wrap(m.getAttribute('data-alr-tex') ?? '', m.getAttribute('data-alr-display') === 'block')));
  });
  // Native KaTeX left in the selection -> TeX as well, so the output is consistent.
  // Document order puts .katex-display before its inner .katex; once the display is replaced the
  // inner one is no longer in the fragment and is skipped.
  frag.querySelectorAll('.katex-display, .katex').forEach((k) => {
    if (!frag.contains(k)) return;
    const tex = getTexSource(k);
    if (tex !== null) k.replaceWith(doc.createTextNode(wrap(tex, isDisplayUnit(k))));
  });
  return frag;
}

/** Plain text with paragraph breaks (jsdom-safe; does not need layout). */
export function fragmentText(node: Node): string {
  let out = '';
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      out += (n as Text).data;
      return;
    }
    if (n.nodeType !== 1 && n.nodeType !== 11) return;
    const el = n as Element;
    const tag = n.nodeType === 1 ? el.tagName : '';
    if (tag === 'BR') {
      out += '\n';
      return;
    }
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'BUTTON') return;
    const block = BLOCK.has(tag);
    if (block && out && !out.endsWith('\n')) out += '\n';
    if (tag === 'LI') out += '- ';
    if (tag === 'TD' || tag === 'TH') {
      if (out && !out.endsWith('\n')) out += '\t';
    }
    for (let ch = n.firstChild; ch; ch = ch.nextSibling) walk(ch);
    if (block && !out.endsWith('\n')) out += '\n';
  };
  walk(node);
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Capture-phase copy listener body. Returns true if it handled the event. */
export function handleCopy(e: ClipboardEvent): boolean {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount || !e.clipboardData) return false;
  const range = sel.getRangeAt(0);
  if (!rangeHasOurMath(range)) return false;
  const frag = selectionFragment(range);
  const holder = document.createElement('div');
  holder.append(frag.cloneNode(true));
  e.clipboardData.setData('text/plain', fragmentText(frag));
  e.clipboardData.setData('text/html', holder.innerHTML);
  e.preventDefault();
  e.stopImmediatePropagation(); // the page's own TeX-copy handler would add the formulas again
  return true;
}
