import { describe, expect, it } from 'vitest';
import { parseMacros, DEFAULT_MACROS_TEXT } from '../../src/tex/macros';
import { preprocessTex, rewriteBraket, rewriteSiunitx, isNumeric } from '../../src/tex/preprocess';
import { normalizeSettings, parseCommandList, DEFAULT_SETTINGS } from '../../src/shared/settings';

describe('parseMacros', () => {
  it('parses \\newcommand with and without arguments and defaults', () => {
    const { macros, errors } = parseMacros(String.raw`
      \newcommand{\R}{\mathbb{R}}
      \newcommand\vect[1]{\boldsymbol{#1}}
      \renewcommand{\pair}[2][x]{(#1,#2)} % comment
    `);
    expect(errors).toEqual([]);
    expect(macros).toEqual({ R: '\\mathbb{R}', vect: ['\\boldsymbol{#1}', 1], pair: ['(#1,#2)', 2, 'x'] });
  });

  it('parses \\DeclareMathOperator(*) and \\def', () => {
    const { macros, errors } = parseMacros(String.raw`\DeclareMathOperator{\Tr}{Tr}
\DeclareMathOperator*{\argmax}{arg\,max}
\def\half{\frac12}
\def\avg#1{\langle #1\rangle}`);
    expect(errors).toEqual([]);
    expect(macros.Tr).toBe('\\operatorname{Tr}');
    expect(macros.argmax).toBe('\\operatorname*{arg\\,max}');
    expect(macros.half).toBe('\\frac12');
    expect(macros.avg).toEqual(['\\langle #1\\rangle', 1]);
  });

  it('nested braces in bodies', () => {
    const { macros } = parseMacros('\\newcommand{\\bra}[1]{\\left\\langle{#1}\\right|}');
    expect(macros.bra).toEqual(['\\left\\langle{#1}\\right|', 1]);
  });

  it('reports errors but keeps valid lines', () => {
    const { macros, errors } = parseMacros('\\newcommand{\\a}{x}\n\\newcommand{\\b}\n\\foo{y}\n\\newcommand{\\c}{z}');
    expect(Object.keys(macros)).toEqual(['a', 'c']);
    expect(errors.length).toBe(2);
  });

  it('default macros only add new names', () => {
    const { macros, errors } = parseMacros(DEFAULT_MACROS_TEXT);
    expect(errors).toEqual([]);
    expect(Object.keys(macros).sort()).toEqual(['diff', 'ee', 'ii', 'mat', 'vect']);
  });
});

describe('rewriteBraket (braket vs physics)', () => {
  it('rewrites braket-style bars to physics forms', () => {
    expect(rewriteBraket('\\braket{\\psi|\\phi}')).toBe('\\braket{\\psi}{\\phi}');
    expect(rewriteBraket('\\braket{m|\\hat H|n}')).toBe('\\mel{m}{\\hat H}{n}');
  });

  it('leaves physics forms and nested braces alone', () => {
    expect(rewriteBraket('\\braket{a}{b}')).toBe('\\braket{a}{b}');
    expect(rewriteBraket('\\braket{a}')).toBe('\\braket{a}');
    expect(rewriteBraket('\\braket{\\frac{a|b}{2}}')).toBe('\\braket{\\frac{a|b}{2}}');
    expect(rewriteBraket('\\Braket{a|b}')).toBe('\\Braket{a|b}');
  });
});

describe('rewriteSiunitx (\\qty conflict)', () => {
  it('numeric \\qty{n}{unit} -> number + upright unit', () => {
    expect(rewriteSiunitx('\\qty{25}{kJ.mol^{-1}}')).toBe('{25\\,\\mathrm{kJ\\,mol^{-1}}}');
    expect(rewriteSiunitx('\\qty{1.5e-3}{\\kilo\\joule\\per\\mole}')).toBe('{1.5\\times 10^{-3}\\,\\mathrm{kJ}\\,\\mathrm{mol}^{-1}}');
    expect(rewriteSiunitx('\\SI{298.15}{\\kelvin}')).toBe('{298.15\\,\\mathrm{K}}');
  });

  it('physics \\qty forms are untouched', () => {
    expect(rewriteSiunitx('\\qty(\\frac{a}{b})')).toBe('\\qty(\\frac{a}{b})');
    expect(rewriteSiunitx('\\qty{\\frac{a}{b}}')).toBe('\\qty{\\frac{a}{b}}');
    expect(rewriteSiunitx('\\qty{x}{y}')).toBe('\\qty{x}{y}'); // non-numeric first argument
    expect(rewriteSiunitx('\\qty[\\frac{a}{b}]')).toBe('\\qty[\\frac{a}{b}]');
  });

  it('\\si / \\unit units with powers', () => {
    expect(rewriteSiunitx('\\si{\\joule\\per\\mole\\per\\kelvin}')).toBe('{\\mathrm{J}\\,\\mathrm{mol}^{-1}\\,\\mathrm{K}^{-1}}');
    expect(rewriteSiunitx('\\unit{\\square\\metre}')).toBe('{\\mathrm{m}^{2}}');
    expect(rewriteSiunitx('\\si{\\metre\\squared}')).toBe('{\\mathrm{m}^{2}}');
  });

  it('user-defined names are excluded', () => {
    expect(preprocessTex('\\qty{25}{kJ}', { smartBraket: true, siunitx: true, exclude: new Set(['qty']) })).toBe('\\qty{25}{kJ}');
  });

  it('isNumeric', () => {
    for (const s of ['25', '-3.5', '1.5e-3', '6.022 x 10^{23}', '1,000', '+-0.2', '12.3(4)']) expect(isNumeric(s)).toBe(true);
    for (const s of ['x', '\\frac{1}{2}', 'a+b']) expect(isNumeric(s)).toBe(false);
  });
});

describe('settings', () => {
  it('normalizes unknown / wrong-typed values to defaults', () => {
    const s = normalizeSettings({ enabled: 'yes', mode: 'weird', scale: 999, foo: 1 });
    expect(s.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(s.mode).toBe('compat');
    expect(s.scale).toBe(250);
    expect('foo' in s).toBe(false);
  });

  it('parses command lists in several separators', () => {
    expect(parseCommandList('ce, \\pu；qty  vb,')).toEqual(['ce', 'pu', 'qty', 'vb']);
  });
});
