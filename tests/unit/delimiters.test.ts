import { describe, expect, it } from 'vitest';
import { BARRIER, findMath, DEFAULT_SCAN } from '../../src/tex/delimiters';

const texs = (s: string, o = DEFAULT_SCAN) => findMath(s, o).map((m) => [m.delim, m.tex, m.display]);

describe('findMath: delimiters', () => {
  it('finds the four standard delimiters', () => {
    expect(texs('a \\(x+1\\) b \\[y\\] c $z$ d $$w$$ e')).toEqual([
      ['\\(', 'x+1', false],
      ['\\[', 'y', true],
      ['$', 'z', false],
      ['$$', 'w', true],
    ]);
  });

  it('multi-line display math', () => {
    expect(texs('$$\n\\begin{aligned} a&=b\\\\ c&=d \\end{aligned}\n$$')).toEqual([
      ['$$', '\\begin{aligned} a&=b\\\\ c&=d \\end{aligned}', true],
    ]);
  });

  it('bare math environments', () => {
    const r = findMath('see \\begin{align} a&=b \\end{align} done');
    expect(r).toHaveLength(1);
    expect(r[0].tex).toBe('\\begin{align} a&=b \\end{align}');
    expect(r[0].display).toBe(true);
  });

  it('ignores non-math environments', () => {
    expect(findMath('\\begin{itemize} x \\end{itemize}')).toEqual([]);
  });
});

describe('findMath: currency and escapes', () => {
  it('does not treat currency as math', () => {
    expect(texs('price $5 and $10.')).toEqual([]);
    expect(texs('这个东西售价 $5 到 $10。')).toEqual([]);
    expect(texs('costs $1,000 or $2,500 per year')).toEqual([]);
    expect(texs('$5$10')).toEqual([]);
  });

  it('math next to currency still works', () => {
    expect(texs('$a+b=c$ and price $5 and $10.')).toEqual([['$', 'a+b=c', false]]);
  });

  it('escaped dollars are literal', () => {
    expect(texs('\\$5 and \\$x\\$')).toEqual([]);
    expect(texs('$a \\$ b$')).toEqual([['$', 'a \\$ b', false]]);
  });

  it('opening $ must not be followed by a space, closing $ not preceded by one', () => {
    expect(texs('$ x$')).toEqual([]);
    expect(texs('$x $')).toEqual([]);
  });

  it('single dollar can be disabled', () => {
    expect(texs('$x$ and $$y$$', { ...DEFAULT_SCAN, singleDollar: false })).toEqual([['$$', 'y', true]]);
  });

  it('single dollar does not span lines', () => {
    expect(texs('$a\nb$')).toEqual([]);
  });
});

describe('findMath: braces, incomplete input, placeholders', () => {
  it('closing delimiter inside braces is skipped (nested \\text{$...$})', () => {
    expect(texs('$\\text{if $x$ then}$')).toEqual([['$', '\\text{if $x$ then}', false]]);
  });

  it('nested braces in \\ce and fractions', () => {
    expect(texs('\\(\\ce{Fe^{3+} + e- -> Fe^{2+}}\\)')).toEqual([['\\(', '\\ce{Fe^{3+} + e- -> Fe^{2+}}', false]]);
    expect(texs('$\\frac{a}{\\sqrt{b}}$')).toEqual([['$', '\\frac{a}{\\sqrt{b}}', false]]);
  });

  it('incomplete formulas (streaming) are left alone', () => {
    expect(texs('text \\(x + ')).toEqual([]);
    expect(texs('text $$\\int_0^1')).toEqual([]);
    expect(texs('\\[\\frac{a}{b')).toEqual([]);
    expect(texs('$\\frac{a}{b$')).toEqual([]);
  });

  it('placeholder bodies are not rendered (tutorial text like "use \\(...\\)")', () => {
    expect(texs('使用 \\(...\\) 和 \\[...\\]，以及 $$...$$ 或 $…$')).toEqual([]);
  });

  it('math never spans a barrier (code / existing formula)', () => {
    expect(texs(`$a ${BARRIER} b$`)).toEqual([]);
    expect(texs(`\\(x${BARRIER}\\)`)).toEqual([]);
  });

  it('double backslash is a line break, not an escape of the delimiter', () => {
    expect(texs('\\[a \\\\ b\\]')).toEqual([['\\[', 'a \\\\ b', true]]);
  });

  it('mixed Chinese and English text', () => {
    expect(texs('能斯特方程 \\(E=E^\\circ-\\frac{RT}{nF}\\ln Q\\)，其中 $Q$ 为反应商。')).toEqual([
      ['\\(', 'E=E^\\circ-\\frac{RT}{nF}\\ln Q', false],
      ['$', 'Q', false],
    ]);
  });

  it('reports exact offsets', () => {
    const s = 'ab $x$ cd';
    const [m] = findMath(s);
    expect(s.slice(m.start, m.end)).toBe('$x$');
  });
});
