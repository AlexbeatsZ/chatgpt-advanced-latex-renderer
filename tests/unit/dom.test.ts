// @vitest-environment jsdom
// DOM extraction tests on a SIMULATED ChatGPT structure (see tests/fixtures/chatgpt-page.mjs).
import { describe, expect, it, beforeEach } from 'vitest';
import { assistantTurn, blockMath, codeBlock, inlineMath, list, para, table, text, userTurn } from '../fixtures/chatgpt-page.mjs';
import { detectFailure, findRenderedUnits, getTexSource, isDisplayUnit, usesPreferred } from '../../src/dom/katex';
import { authorOf, messageRoots } from '../../src/dom/scope';
import { collectText, findRawUnits, replaceSegments, scanUnit, unitSignature } from '../../src/dom/rawText';
import { DEFAULT_SCAN, BARRIER } from '../../src/tex/delimiters';

function mount(html: string) {
  document.body.innerHTML = `<main>${html}</main>`;
  return document.querySelector('main')!;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('rendered formulas (KaTeX)', () => {
  it('finds one unit per formula and recovers the exact TeX from the annotation', () => {
    mount(
      assistantTurn(0, [
        para(`其中 ${inlineMath('E^\\circ')} 为标准电势`),
        blockMath('\\ce{Fe^{3+} + e- -> Fe^{2+}}'),
        blockMath('\\boxed{E=E^\\circ-\\frac{RT}{nF}\\ln Q}'),
      ]),
    );
    const units = findRenderedUnits(document);
    expect(units).toHaveLength(3);
    expect(units.map(getTexSource)).toEqual(['E^\\circ', '\\ce{Fe^{3+} + e- -> Fe^{2+}}', '\\boxed{E=E^\\circ-\\frac{RT}{nF}\\ln Q}']);
    expect(units.map(isDisplayUnit)).toEqual([false, true, true]);
  });

  it('detects KaTeX silent failures (red undefined command) and names the command', () => {
    mount(assistantTurn(0, [blockMath('\\ce{A <=> B}'), blockMath('\\frac{a}{b}')]));
    const [ce, ok] = findRenderedUnits(document);
    expect(detectFailure(ce)).toEqual({ failed: true, commands: ['ce'] });
    expect(detectFailure(ok)).toEqual({ failed: false, commands: [] });
  });

  it('detects KaTeX parse errors and recovers TeX from the error span', () => {
    mount(assistantTurn(0, [para(`x ${inlineMath('\\frac{a}{')} y`)]));
    const [u] = findRenderedUnits(document);
    expect(detectFailure(u).failed).toBe(true);
    expect(getTexSource(u)).toBe('\\frac{a}{');
  });

  it('returns null (keep page rendering) when no source is in the DOM', () => {
    mount(assistantTurn(0, [blockMath('x^2')]));
    document.querySelectorAll('annotation').forEach((a) => a.remove());
    const [u] = findRenderedUnits(document);
    expect(getTexSource(u)).toBeNull();
  });

  it('recovers from data-latex / script[type=math/tex] when there is no annotation', () => {
    mount('<span class="katex" data-latex="$a+b$">a+b</span><span class="katex"><script type="math/tex">c^2</script></span>');
    expect(findRenderedUnits(document).map(getTexSource)).toEqual(['a+b', 'c^2']);
  });

  it('preferred command detection', () => {
    expect(usesPreferred('\\pu{25 kJ}', new Set(['ce', 'pu']))).toBe(true);
    expect(usesPreferred('\\cedilla', new Set(['ce']))).toBe(false);
  });

  it('skips formulas inside our own output and hidden originals', () => {
    mount(assistantTurn(0, [blockMath('x'), '<alr-math>' + inlineMath('y') + '</alr-math>', `<p data-alr-raw-hidden>${inlineMath('z')}</p>`]));
    expect(findRenderedUnits(document).map(getTexSource)).toEqual(['x']);
  });
});

describe('message scope', () => {
  it('finds assistant / user turns without data-message-author-role', () => {
    mount(userTurn(0, 'hi $x$') + assistantTurn(0, [para('a')]));
    const all = messageRoots(document.body, true);
    expect(all.map(authorOf)).toEqual(['user', 'assistant']);
    expect(messageRoots(document.body, false).map(authorOf)).toEqual(['assistant']);
  });

  it('also supports the legacy data-message-author-role markup', () => {
    mount('<div data-message-author-role="assistant"><div class="markdown"><p>x</p></div></div>');
    expect(messageRoots(document.body, false)).toHaveLength(1);
  });

  it('returns the enclosing turn for an inner element', () => {
    mount(assistantTurn(3, [para('<b id="t">x</b>')]));
    const r = messageRoots(document.getElementById('t')!, false);
    expect(r).toHaveLength(1);
    expect(r[0].getAttribute('data-content-search-unit-key')).toContain(':assistant');
  });
});

describe('raw text scanning', () => {
  it('code blocks (CodeMirror), inline code and the composer are never scanned', () => {
    const root = mount(
      assistantTurn(0, [
        para(`真公式 $a+b$ 和代码 <code>$z$</code>`),
        codeBlock('s = "$x^2$"\nt = r"\\(y\\)"'),
      ]) + '<form><div contenteditable="true">$q$</div></form>',
    );
    const units = findRawUnits(root);
    expect(units).toHaveLength(1);
    const scans = scanUnit(units[0], DEFAULT_SCAN);
    expect(scans.flatMap((s) => s.segments.map((m) => m.tex))).toEqual(['a+b']);
  });

  it('inline code acts as a barrier: math cannot span across it', () => {
    const root = mount(assistantTurn(0, [para('$a <code>x</code> b$')]));
    const [u] = findRawUnits(root);
    expect(collectText(u).text).toBe(`$a ${BARRIER} b$`);
    expect(scanUnit(u, DEFAULT_SCAN)).toEqual([]);
  });

  it('streaming per-word spans: TeX split across many spans is still found', () => {
    const root = mount(assistantTurn(0, [para(text('Inline \\(E=mc^2\\) and $a+b=c$ and price $5 and $10.'), { streamWords: true })]));
    const [u] = findRawUnits(root);
    expect(u.querySelectorAll('[data-d-stream-word]').length).toBeGreaterThan(5);
    expect(scanUnit(u, DEFAULT_SCAN).flatMap((s) => s.segments.map((m) => m.tex))).toEqual(['E=mc^2', 'a+b=c']);
  });

  it('currency is untouched, placeholders are untouched', () => {
    const root = mount(assistantTurn(0, [para('售价 $5 到 $10。'), para(text('使用 \\(...\\) 和 \\[...\\]'))]));
    expect(findRawUnits(root).flatMap((u) => scanUnit(u, DEFAULT_SCAN))).toEqual([]);
  });

  it('nested blocks: the outermost list item is the unit and nested blocks are scanned separately', () => {
    const root = mount(assistantTurn(0, [list([`外层 $x$ <p>段落 $y$</p>${list(['内层 $z$'])}`])]));
    const units = findRawUnits(root);
    expect(units).toHaveLength(1);
    expect(units[0].tagName).toBe('LI');
    const all = scanUnit(units[0], DEFAULT_SCAN).flatMap((s) => s.segments.map((m) => m.tex)).sort();
    expect(all).toEqual(['x', 'y', 'z']);
  });

  it('table cells are separate units', () => {
    const root = mount(assistantTurn(0, [table([['$a$', '$b$'], ['c', '$5 and $6']])]));
    const units = findRawUnits(root);
    expect(units.map((u) => u.tagName)).toEqual(['TD', 'TD', 'TD']);
    expect(units.flatMap((u) => scanUnit(u, DEFAULT_SCAN)).flatMap((s) => s.segments.map((m) => m.tex))).toEqual(['a', 'b']);
  });

  it('replaceSegments rewrites a clone across span boundaries and keeps surrounding text', () => {
    const root = mount(assistantTurn(0, [para(text('A \\(x^2\\) B $y$ C'), { streamWords: true })]));
    const [u] = findRawUnits(root);
    const clone = u.cloneNode(true) as Element;
    for (const s of scanUnit(clone, DEFAULT_SCAN)) {
      replaceSegments(s.map, s.segments, (seg) => {
        const el = document.createElement('alr-math');
        el.setAttribute('data-tex', seg.tex);
        return el;
      });
    }
    expect([...clone.querySelectorAll('alr-math')].map((e) => e.getAttribute('data-tex'))).toEqual(['x^2', 'y']);
    expect(clone.textContent!.replace(/\s+/g, ' ').trim()).toBe('A B C');
    expect(u.textContent).toContain('\\(x^2\\)'); // original untouched
  });

  it('signature is stable across our own KaTeX upgrades but changes with page text', () => {
    const root = mount(assistantTurn(0, [para(`t $a$ ${inlineMath('\\ce{H2O}')}`)]));
    const [u] = findRawUnits(root);
    const before = unitSignature(u);
    const k = u.querySelector('.katex')!;
    k.setAttribute('data-alr-hidden', '');
    k.after(document.createElement('alr-math'));
    expect(unitSignature(u)).toBe(before);
    u.appendChild(document.createTextNode(' more'));
    expect(unitSignature(u)).not.toBe(before);
  });
});
