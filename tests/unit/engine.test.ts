// Engine tests run MathJax for real (Node + liteAdaptor): every case must compile without a TeX error.
import { describe, expect, it, beforeAll } from 'vitest';
import { liteAdaptor } from '@mathjax/src/mjs/adaptors/liteAdaptor.js';
import { TexEngine } from '../../src/render/engine';
import { parseMacros, DEFAULT_MACROS_TEXT } from '../../src/tex/macros';
import { preprocessTex } from '../../src/tex/preprocess';
import { CASES } from '../fixtures/formulas';
import { fontLoaders } from '../../src/render/fontLoaders';

const loadFont = (name: string) => fontLoaders[name]();

const adaptor = liteAdaptor();
let engine: TexEngine<any>;
const M = { em: 16, ex: 8, containerWidth: 800 };

// A glyph missing from the SVG font falls back to an empty or private-use <text> node.
const MISSING_GLYPH = /<text[^>]*><\/text>|<text[^>]*>[-]/;

async function svgOf(tex: string, display = false) {
  const r = await engine.render(preprocessTex(tex), display, M);
  if (!r.ok) throw new Error(`${tex} -> ${r.error}`);
  return adaptor.outerHTML(r.node);
}

beforeAll(() => {
  const { macros } = parseMacros(DEFAULT_MACROS_TEXT);
  engine = new TexEngine(adaptor, '', { macros, physicsOverridesStandard: false }, loadFont);
});

describe('MathJax engine compiles all fixture formulas', () => {
  for (const c of CASES) {
    it(`${c.group}: ${c.tex}`, async () => {
      const svg = await svgOf(c.tex, c.display);
      expect(svg).toContain('<svg');
      expect(svg).not.toContain('data-mjx-error');
      expect(svg).not.toMatch(MISSING_GLYPH);
      if (c.group === 'mhchem' || c.group === 'physics') expect(svg).not.toContain('<text');
    });
  }
});

describe('engine semantics', () => {
  it('reports undefined commands as errors (so the page rendering is kept)', async () => {
    const r = await engine.render('\\definitelyNotACommand{x}', false, M);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Undefined control sequence/);
  });

  it('reports unbalanced braces as errors', async () => {
    const r = await engine.render('\\frac{a}{b', false, M);
    expect(r.ok).toBe(false);
  });

  it('mhchem equilibrium arrow uses the mhchem font extension glyph', async () => {
    const svg = await svgOf('\\ce{A <=> B}');
    expect(svg).not.toContain('<text');
    expect(svg).toContain('data-c="E408"');
  });

  it('keeps standard \\div as ÷ by default', async () => {
    const svg = await svgOf('a \\div b');
    expect(svg).toContain('data-c="F7"');
  });

  it('physicsOverridesStandard=true makes \\div the divergence operator', async () => {
    const e2 = new TexEngine<any>(adaptor, '', { macros: {}, physicsOverridesStandard: true }, loadFont);
    const r = await e2.render('\\div{\\vb{E}}', false, M);
    expect(r.ok).toBe(true);
    if (r.ok) expect(adaptor.outerHTML(r.node)).toContain('gradientnabla');
  });

  it('\\ln[\\ce{A}] keeps standard meaning (physics would make [A] a power: ln^A)', async () => {
    // Real case from chatgpt.com: "对 \ln[\ce{A}] 求导"
    const cases = ['\\ln[\\ce{A}]', '\\frac{\\mathrm d\\ln r}{\\mathrm d\\ln[\\ce{A}]}', '\\sin[x]', '\\exp[-E_a/RT]', '\\log[c]'];
    for (const tex of cases) {
      const svg = await svgOf(tex);
      expect(svg, tex).not.toContain('data-mml-node="msup"'); // none of these has a superscript
      expect(svg, tex).toContain('data-c="5B"'); // the "[" is printed
    }
    // Sanity: with physics semantics the same input DOES become a power, so the check is meaningful.
    const phys = new TexEngine<any>(adaptor, '', { macros: {}, physicsOverridesStandard: true }, loadFont);
    const r = await phys.render('\\ln[\\ce{A}]', false, M);
    expect(r.ok && adaptor.outerHTML(r.node)).toContain('data-mml-node="msup"');
  });

  it('standard functions keep base spacing: \\sin x and \\ln(x)', async () => {
    expect(await svgOf('\\sin x + \\ln(x) + \\det A + \\Pr(A)')).toContain('<svg');
  });

  it('physicsOverridesStandard=true restores physics function syntax (\\sin[2](x) = power)', async () => {
    const e2 = new TexEngine<any>(adaptor, '', { macros: {}, physicsOverridesStandard: true }, loadFont);
    const r = await e2.render('\\sin[2](x)', false, M);
    expect(r.ok).toBe(true);
    if (r.ok) expect(adaptor.outerHTML(r.node)).toContain('data-mml-node="msup"');
  });

  it('user macros override the restored standard functions', async () => {
    const e3 = new TexEngine<any>(adaptor, '', { macros: { ln: '\\operatorname{Ln}' }, physicsOverridesStandard: false }, loadFont);
    const r = await e3.render('\\ln x', false, M);
    expect(r.ok && adaptor.outerHTML(r.node)).toContain('data-c="4C"'); // capital L
  });

  it('user macros work', async () => {
    const svg = await svgOf('\\vect{v} \\cdot \\mat{A} \\ee^{\\ii\\pi}');
    expect(svg).toContain('<svg');
  });

  it('\\tag shows a tag in display math', async () => {
    const svg = await svgOf('E=mc^2 \\tag{1}', true);
    expect(svg).toContain('mlabeledtr');
  });

  it('labels can be re-rendered without "multiply defined" errors', async () => {
    await svgOf('x \\label{eq:a} \\tag{1}', true);
    await svgOf('x \\label{eq:a} \\tag{1}', true);
  });

  // Vertical bars in the output distinguish physics (<a|b>) from braket-package / wrong results.
  const bars = (svg: string) => (svg.match(/data-c="(7C|2223|2758)"/g) ?? []).length;

  it('physics owns \\bra \\ket \\braket (contraction, two-argument form)', async () => {
    expect(bars(await svgOf('\\bra{\\psi}\\ket{\\phi}'))).toBe(1); // the braket package would give ||
    const two = await svgOf('\\braket{\\psi}{\\phi}');
    expect(bars(two)).toBe(1);
    expect(two).toContain('data-c="27E8"');
    expect(two).toContain('data-c="27E9"');
  });

  it('braket-style \\braket{a|b} / \\braket{a|H|b} are rewritten to the physics equivalents', async () => {
    const strip = (s: string) => s.replace(/data-latex="[^"]*"/g, '');
    expect(strip(await svgOf('\\braket{\\psi|\\phi}'))).toBe(strip(await svgOf('\\braket{\\psi}{\\phi}')));
    expect(bars(await svgOf('\\braket{m|\\hat H|n}'))).toBe(2);
  });

  it('braket package extras remain available', async () => {
    expect(await svgOf('\\Braket{\\phi|\\psi} \\set{x|x>0}')).toContain('<svg');
  });
});
