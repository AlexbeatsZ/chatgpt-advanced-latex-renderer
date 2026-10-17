# Third-party notices

The built extension (`dist/`) bundles the following software. All of it is used unmodified.

| Package | Version | License | Use |
|---|---|---|---|
| [@mathjax/src](https://github.com/mathjax/MathJax-src) | 4.1.3 | Apache-2.0 | TeX input, SVG output, TeX extensions (ams, mhchem, physics, braket, mathtools, …) |
| [@mathjax/mathjax-newcm-font](https://github.com/mathjax/MathJax-fonts) | 4.1.3 | Apache-2.0 | SVG glyph data (derived from the New Computer Modern fonts) |
| [@mathjax/mathjax-mhchem-font-extension](https://github.com/mathjax/MathJax-fonts) | 4.1.3 | Apache-2.0 | mhchem arrows and bonds (variant `-mhchem`) |
| [mhchemparser](https://github.com/mhchem/mhchemParser) | 4.2.1 | Apache-2.0 | `\ce` / `\pu` parser (dependency of MathJax's mhchem extension) |

The Apache License 2.0 text is available at <https://www.apache.org/licenses/LICENSE-2.0> and in
`node_modules/@mathjax/src/LICENSE` after `pnpm install`.

Development-only dependencies (not shipped): KaTeX (MIT, used to generate realistic test fixtures),
Vite, Vitest, jsdom, Playwright, TypeScript.

## Reference projects

Read for design comparison only; **no code was copied**.

| Project | License | What was taken |
|---|---|---|
| [alejandro-ao/chatgpt-equations](https://github.com/alejandro-ao/chatgpt-equations) | ISC (package.json) | Nothing; its `innerHTML` replacement of `<p>` is the approach this project avoids. |
| [zihang-huang/ChatMathEquation](https://github.com/zihang-huang/ChatMathEquation) | none declared | Idea of the source-recovery order (annotation → script → data attributes); never reverse-engineering glyphs. |
| [Vinken-y/ChatGPT_Latex](https://github.com/Vinken-y/ChatGPT_Latex) | MIT | Idea of an attribute-filtered MutationObserver and broad selector lists. |
| Gemini MathJaxify (Chrome Web Store) | closed source | Product-level reference only. |
