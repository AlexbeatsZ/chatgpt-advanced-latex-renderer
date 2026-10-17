// @vitest-environment jsdom
// Copy must yield each formula once, even though the page's own TeX-copy handler (ChatGPT / KaTeX
// copy-tex style: clone selection, replace every .katex with its TeX, ignore CSS) is present.
import { describe, expect, it, beforeEach } from 'vitest';
import { assistantTurn, inlineMath, blockMath, para } from '../fixtures/chatgpt-page.mjs';
import { fragmentText, handleCopy, rangeHasOurMath, selectionFragment } from '../../src/content/copy';
import { getTexSource } from '../../src/dom/katex';

/** What the controller does for a KaTeX formula it upgrades. */
function upgrade(k: Element) {
  const tex = getTexSource(k)!;
  const m = document.createElement('alr-math');
  m.setAttribute('data-alr-tex', tex);
  m.setAttribute('data-alr-src', 'katex');
  m.setAttribute('data-alr-display', k.matches('.katex-display') ? 'block' : 'inline');
  m.innerHTML = `<mjx-container><svg><g><path d="M0 0"></path></g></svg></mjx-container><span class="alr-copy">${k.matches('.katex-display') ? '$$' + tex + '$$' : '$' + tex + '$'}</span>`;
  k.after(m);
  k.setAttribute('data-alr-hidden', '');
}

/** The page's handler: copy-tex behaviour (runs in bubble phase on document). */
let pageHandlerRan = 0;
function pageCopyTex(e: ClipboardEvent) {
  pageHandlerRan++;
  const frag = document.getSelection()!.getRangeAt(0).cloneContents();
  frag.querySelectorAll('.katex').forEach((k) => k.replaceWith(`$${k.querySelector('annotation')?.textContent}$`));
  e.clipboardData!.setData('text/plain', frag.textContent ?? '');
  e.preventDefault();
}

function select(node: Node) {
  const r = document.createRange();
  r.selectNodeContents(node);
  const s = document.getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
  return r;
}

function fireCopy() {
  const data = new Map<string, string>();
  const e = new Event('copy', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(e, 'clipboardData', { value: { setData: (t: string, v: string) => data.set(t, v), getData: (t: string) => data.get(t) ?? '' } });
  document.body.dispatchEvent(e);
  return data;
}

beforeEach(() => {
  pageHandlerRan = 0;
  document.body.innerHTML = '';
});

describe('copy', () => {
  it('reproduces the bug without our handler: the page handler outputs the formula twice', () => {
    document.body.innerHTML = assistantTurn(0, [para(`其中 ${inlineMath('[\\ce{D}]')} 表示浓度`)]);
    upgrade(document.querySelector('.katex')!);
    document.addEventListener('copy', pageCopyTex);
    select(document.querySelector('p')!);
    const out = fireCopy().get('text/plain')!;
    expect(out.split('\\ce{D}').length - 1).toBeGreaterThanOrEqual(2);
    document.removeEventListener('copy', pageCopyTex);
  });

  it('with our capture handler each formula appears exactly once (upgraded, native and raw-text)', () => {
    document.body.innerHTML = assistantTurn(0, [
      para(`其中 ${inlineMath('[\\ce{D}]')} 表示浓度，原生 ${inlineMath('E^\\circ')} 和原文 X`),
      blockMath('\\ce{A <=> B}'),
    ]);
    const ks = [...document.querySelectorAll('.katex-display, .katex')].filter((k) => !(k.matches('.katex') && k.parentElement!.closest('.katex-display')));
    upgrade(ks[0]); // inline \ce
    upgrade(ks[2]); // display \ce
    // a raw-text formula rendered in place: the page text node keeps "原文 " and our nodes follow
    const p = document.querySelector('p')!;
    const raw = document.createElement('alr-math');
    raw.setAttribute('data-alr-tex', 'a+b');
    raw.setAttribute('data-alr-src', 'text');
    raw.setAttribute('data-alr-display', 'inline');
    raw.innerHTML = '<mjx-container><svg></svg></mjx-container><span class="alr-copy">$a+b$</span>';
    p.lastChild!.textContent = ' 和原文 ';
    p.appendChild(raw);

    window.addEventListener('copy', (e) => handleCopy(e as ClipboardEvent), true);
    document.addEventListener('copy', pageCopyTex);
    select(document.querySelector('[data-content-search-unit-key]')!);
    const data = fireCopy();
    const text = data.get('text/plain')!;
    expect(pageHandlerRan).toBe(0); // the page handler did not add duplicates
    const count = (s: string) => text.split(s).length - 1;
    expect(count('\\ce{D}')).toBe(1);
    expect(count('E^\\circ')).toBe(1);
    expect(count('\\ce{A <=> B}')).toBe(1);
    expect(count('a+b')).toBe(1);
    expect(text).toContain('其中 $[\\ce{D}]$ 表示浓度');
    expect(text).toContain('$$\\ce{A <=> B}$$');
    expect(data.get('text/html')).not.toContain('<svg');
    document.removeEventListener('copy', pageCopyTex);
  });

  it('selection inside a single formula copies just that formula', () => {
    document.body.innerHTML = assistantTurn(0, [para(`x ${inlineMath('\\ce{H2O}')} y`)]);
    upgrade(document.querySelector('.katex')!);
    const r = select(document.querySelector('alr-math svg')!);
    expect(fragmentText(selectionFragment(r))).toBe('$\\ce{H2O}$');
  });

  it('selections without our formulas are left to the page', () => {
    document.body.innerHTML = assistantTurn(0, [para(`x ${inlineMath('E=mc^2')} y`), para('plain')]);
    const r = select(document.querySelectorAll('p')[1]);
    expect(rangeHasOurMath(r)).toBe(false);
    const e = new Event('copy', { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(e, 'clipboardData', { value: { setData() {}, getData: () => '' } });
    expect(handleCopy(e)).toBe(false);
    expect(e.defaultPrevented).toBe(false);
  });

  it('plain text keeps paragraph and list structure', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>a</p><p>b<br>c</p><ul><li>x</li><li>y</li></ul>';
    expect(fragmentText(div)).toBe('a\nb\nc\n- x\n- y');
  });
});
