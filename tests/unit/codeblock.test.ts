// @vitest-environment jsdom
// ```latex code-block previews (observed on chatgpt.com 2026-10-17: KaTeX failure -> "LaTeX 代码无效").
import { describe, expect, it } from 'vitest';
import { splitLatexSnippet } from '../../src/tex/snippet';
import { findPreviewErrors, findRenderedUnits, getCodeBlockSource } from '../../src/dom/katex';
import { assistantTurn, latexCodeBlock } from '../fixtures/chatgpt-page.mjs';

// Verbatim sources from the real page.
const REAL_CHEM = '% 酸性条件下高锰酸根的还原半反应\n\\ce{MnO4^- + 8H+ + 5e- -> Mn^2+ + 4H2O}\n\n% Fe3+/Fe2+ 电对\n\\ce{Fe^3+ + e- <=> Fe^2+}\n\n% 可逆反应\n\\ce{A <=> B}\n\n% 自由基阳离子\n\\ce{M^{+.}}\n\n% 标准反应焓示例\n\\pu{-285.8 kJ mol-1}';
const REAL_PHYS = '% 偏导数\n\\pdv{f}{x}\n\n% 普通导数\n\\dv{f}{t}\n\n% Dirac 符号：内积\n\\bra{\\psi}\\ket{\\phi}\n\n% 自动括号\n\\qty(\\frac{a}{b})\n\n% 向量\n\\vb{F}\n\n% 算符对易子\n\\comm{A}{B}';

describe('splitLatexSnippet', () => {
  it('strips comments and splits on blank lines', () => {
    expect(splitLatexSnippet(REAL_CHEM)).toEqual([
      '\\ce{MnO4^- + 8H+ + 5e- -> Mn^2+ + 4H2O}',
      '\\ce{Fe^3+ + e- <=> Fe^2+}',
      '\\ce{A <=> B}',
      '\\ce{M^{+.}}',
      '\\pu{-285.8 kJ mol-1}',
    ]);
    expect(splitLatexSnippet(REAL_PHYS)).toHaveLength(6);
  });

  it('keeps environments and open groups together across blank lines', () => {
    expect(splitLatexSnippet('\\begin{aligned}\na&=b\\\\\n\nc&=d\n\\end{aligned}\n\nx')).toEqual(['\\begin{aligned}\na&=b\\\\\n\nc&=d\n\\end{aligned}', 'x']);
    expect(splitLatexSnippet('\\frac{a\n\n}{b}')).toEqual(['\\frac{a\n\n}{b}']);
  });

  it('uses delimiters when the snippet has them', () => {
    expect(splitLatexSnippet('Text $a$ and\n$$\\ce{H2O}$$')).toEqual(['a', '\\ce{H2O}']);
  });

  it('does not treat an escaped percent as a comment', () => {
    expect(splitLatexSnippet('50\\% \\text{yield}')).toEqual(['50\\% \\text{yield}']);
  });
});

describe('code block preview discovery', () => {
  it('finds failed previews and recovers the source from the code block', () => {
    document.body.innerHTML = assistantTurn(0, [latexCodeBlock(REAL_CHEM), latexCodeBlock('\\sigma_x', { ok: true })]);
    const units = findPreviewErrors(document);
    expect(units).toHaveLength(1);
    expect(units[0].parentElement!.hasAttribute('data-code-block-preview')).toBe(true);
    expect(getCodeBlockSource(units[0])).toBe(REAL_CHEM);
    // the successful preview is ordinary KaTeX, handled by the normal path
    expect(findRenderedUnits(document)).toHaveLength(1);
  });

  it('ignores non-LaTeX sources and whole documents', () => {
    document.body.innerHTML = assistantTurn(0, [latexCodeBlock('graph TD; A-->B'), latexCodeBlock('\\documentclass{article}\\begin{document}x\\end{document}')]);
    expect(findPreviewErrors(document).map(getCodeBlockSource)).toEqual([null, null]);
  });
});
