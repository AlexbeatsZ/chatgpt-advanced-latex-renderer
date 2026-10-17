// @vitest-environment jsdom
// DOM extraction tests on a SIMULATED ChatGPT structure (see tests/fixtures/chatgpt-page.mjs).
import { describe, expect, it, beforeEach } from 'vitest';
import { assistantTurn, blockMath, codeBlock, inlineMath, list, para, table, text, userTurn } from '../fixtures/chatgpt-page.mjs';
import { detectFailure, findRenderedUnits, getTexSource, isDisplayUnit, usesPreferred } from '../../src/dom/katex';
import { authorOf, messageRoots } from '../../src/dom/scope';
import {
  applyBlock, collectText, findRawBlocks, forgetDetached, isUpToDate, restoreAllBlocks, restoreBlock, scanBlock, stateOf,
} from '../../src/dom/rawText';
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
    mount(assistantTurn(0, [blockMath('x'), '<alr-math>' + inlineMath('y') + '</alr-math>']));
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


const texsOf = (root: Element) =>
  findRawBlocks(root).flatMap((b) => scanBlock(b, DEFAULT_SCAN).segments.map((m) => m.tex));

/** Applies all segments of every raw block with a stub renderer (no MathJax needed here). */
function applyAll(root: Element) {
  for (const b of findRawBlocks(root)) {
    const { map, segments } = scanBlock(b, DEFAULT_SCAN);
    if (!segments.length) continue;
    applyBlock(b, map.text, segments, (seg) => {
      const el = document.createElement('alr-math');
      el.setAttribute('data-alr-src', 'text');
      el.setAttribute('data-tex', seg.tex);
      el.textContent = `[${seg.tex}]`;
      return el;
    });
  }
}

/** Snapshot of page-owned nodes: identity + data, to prove we never move/replace them. */
function pageNodes(root: Element) {
  const out: Node[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (!(n as Element).closest?.('alr-math, alr-text') && !n.parentElement?.closest('alr-math, alr-text')) out.push(n);
  return out;
}

describe('raw text scanning', () => {
  beforeEach(() => restoreAllBlocks());

  it('code blocks (CodeMirror), inline code and the composer are never scanned', () => {
    const root = mount(
      assistantTurn(0, [para(`真公式 $a+b$ 和代码 <code>$z$</code>`), codeBlock('s = "$x^2$"\nt = r"\\(y\\)"')]) +
        '<form><div contenteditable="true">$q$</div></form>',
    );
    expect(texsOf(root)).toEqual(['a+b']);
  });

  it('inline code acts as a barrier: math cannot span across it', () => {
    const root = mount(assistantTurn(0, [para('$a <code>x</code> b$')]));
    const [b] = findRawBlocks(root);
    expect(collectText(b).text).toBe(`$a ${BARRIER} b$`);
    expect(texsOf(root)).toEqual([]);
  });

  it('streaming per-word spans: TeX split across many spans is still found', () => {
    const root = mount(assistantTurn(0, [para(text('Inline \\(E=mc^2\\) and $a+b=c$ and price $5 and $10.'), { streamWords: true })]));
    expect(root.querySelectorAll('[data-d-stream-word]').length).toBeGreaterThan(5);
    expect(texsOf(root)).toEqual(['E=mc^2', 'a+b=c']);
  });

  it('currency is untouched, placeholders are untouched', () => {
    const root = mount(assistantTurn(0, [para('售价 $5 到 $10。'), para(text('使用 \\(...\\) 和 \\[...\\]'))]));
    expect(texsOf(root)).toEqual([]);
  });

  it('nested blocks are scanned separately (each block excludes its nested blocks)', () => {
    const root = mount(assistantTurn(0, [list([`外层 $x$ <p>段落 $y$</p>${list(['内层 $z$'])}`])]));
    expect(texsOf(root).sort()).toEqual(['x', 'y', 'z']);
  });

  it('table cells: formulas found, currency left alone', () => {
    const root = mount(assistantTurn(0, [table([['$a$', '$b$'], ['c', '$5 and $6']])]));
    expect(texsOf(root)).toEqual(['a', 'b']);
  });

  it('quiz options inside <label> (observed on chatgpt.com) are found', () => {
    const root = mount(
      assistantTurn(0, [
        '<div data-d-component="box"><p>题 1：对于反应 \\(\\ce{2A -> B}\\)？</p><div role="radiogroup"><div data-d-component="radio"><label for="r1"><div><button role="radio" id="r1"></button></div>\\(k[\\ce{A}]^2\\)</label></div></div></div>',
      ]),
    );
    expect(texsOf(root)).toEqual(['\\ce{2A -> B}', 'k[\\ce{A}]^2']);
  });
});

describe('in-place application (React safety)', () => {
  beforeEach(() => restoreAllBlocks());

  it('never moves, removes or replaces page nodes, and restores them exactly', () => {
    const root = mount(
      assistantTurn(0, [
        para(text('A \\(x^2\\) B $y$ C'), { streamWords: true }),
        para(text('one node: $p$ and $q$ end')),
        para(`mixed <b>bold</b> $r$ ${inlineMath('\\ce{H2O}')} tail $s$`),
        '<div data-d-component="radio"><label for="r1"><div><button role="radio" id="r1"></button></div>\\(k[\\ce{A}]^2\\)</label></div>',
      ]),
    );
    const before = root.innerHTML;
    const nodes = pageNodes(root);
    const parents = nodes.map((n) => n.parentNode);
    applyAll(root);
    const shown = root.textContent!.replace(/\s+/g, ' ');
    expect(shown).toContain('A [x^2] B [y] C');
    expect(shown).toContain('one node: [p] and [q] end');
    expect(shown).toContain('[k[\\ce{A}]^2]');
    expect(shown).toContain('tail [s]');
    // Same page nodes, same parents (data may be changed, nodes never moved).
    const after = pageNodes(root);
    expect(after).toEqual(nodes);
    after.forEach((n, i) => expect(n.parentNode).toBe(parents[i]));
    // The interactive control is untouched.
    expect(root.querySelector('button[role=radio]')!.id).toBe('r1');
    restoreAllBlocks();
    expect(root.innerHTML).toBe(before);
  });

  it('page text as seen by the scanner is unchanged after application (idempotent re-scan)', () => {
    const root = mount(assistantTurn(0, [para(text('A \\(x^2\\) B $y$ C'), { streamWords: true })]));
    const [b] = findRawBlocks(root);
    const t0 = collectText(b).text;
    applyAll(root);
    expect(collectText(b).text).toBe(t0);
    expect(isUpToDate(b)).toBe(true);
  });

  it('when React rewrites a text node we changed, the block is reported stale and React wins on restore', () => {
    const root = mount(assistantTurn(0, [para(text('X $a$ Y'))]));
    const [b] = findRawBlocks(root);
    applyAll(root);
    const textNode = [...b.childNodes].find((n) => n.nodeType === 3) as Text;
    textNode.data = 'X $a$ Y and $b$'; // React's update (nodeValue = new text)
    expect(isUpToDate(b)).toBe(false);
    restoreBlock(b);
    expect(b.textContent).toBe('X $a$ Y and $b$');
    applyAll(root);
    expect(b.querySelectorAll('alr-math').length).toBe(2);
  });

  it('when React removes our inserted node container, the block is stale and re-applies cleanly', () => {
    const root = mount(assistantTurn(0, [para(text('A \\(x\\) B'), { streamWords: true })]));
    const [b] = findRawBlocks(root);
    applyAll(root);
    b.querySelector('alr-math')!.parentElement!.remove(); // React removed a word span
    expect(isUpToDate(b)).toBe(false);
    restoreBlock(b);
    expect(b.querySelectorAll('alr-math, alr-text').length).toBe(0);
  });

  it('multi-line $$...$$ across <br>: the <br> inside the formula is hidden and restored', () => {
    const root = mount(assistantTurn(0, [para('前 $$a<br>=b$$ 后')]));
    const [b] = findRawBlocks(root);
    expect(scanBlock(b, DEFAULT_SCAN).segments.map((s) => s.tex)).toEqual(['a\n=b']);
    applyAll(root);
    expect(b.querySelector('br')!.hasAttribute('data-alr-hidden')).toBe(true);
    restoreAllBlocks();
    expect(b.querySelector('br')!.hasAttribute('data-alr-hidden')).toBe(false);
    expect(b.innerHTML).toBe('前 $$a<br>=b$$ 后');
  });

  it('detached blocks are forgotten', () => {
    const root = mount(assistantTurn(0, [para(text('$a$'))]));
    const [b] = findRawBlocks(root);
    applyAll(root);
    expect(stateOf(b)).toBeTruthy();
    b.remove();
    forgetDetached();
    expect(stateOf(b)).toBeUndefined();
  });
});
