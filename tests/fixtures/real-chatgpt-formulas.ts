// Formulas taken verbatim (annotation TeX) from a real chatgpt.com conversation (chemical kinetics,
// 2026-10-17) - the ones KaTeX failed on. Used to reproduce real-page rendering problems.
export const REAL_FORMULAS: { tex: string; display: boolean }[] = [
  { tex: '\\boxed{r=k[\\ce{D}]^d[\\ce{E}]^e\\qquad\\text{（基元反应）}}', display: true },
  { tex: 'd\\,\\ce{D}+e\\,\\ce{E}\\longrightarrow g\\,\\ce{G}+h\\,\\ce{H}', display: true },
  { tex: '\\ce{N2 + 3H2 -> 2NH3}', display: true },
  { tex: '-\\mathrm d\\nu_{\\ce{N2}}\n=-\\frac13\\mathrm d\\nu_{\\ce{H2}}\n=\\frac12\\mathrm d\\nu_{\\ce{NH3}}', display: true },
  { tex: 'r=-\\frac1d\\frac{\\mathrm d[\\ce{D}]}{\\mathrm dt}', display: true },
  { tex: '[\\ce{D}]', display: false },
  { tex: '\\ce{D}', display: false },
  { tex: '\\begin{aligned}\n\\frac{\\mathrm d[\\ce{D}]}{\\mathrm dt}\n&=\\frac{\\mathrm d}{\\mathrm dt}\\left(\\frac{\\nu_D}{V}\\right)\\\\\n&=\\frac1V\\frac{\\mathrm d\\nu_D}{\\mathrm dt}\n\\end{aligned}', display: true },
  { tex: '\\boxed{\nr=-\\frac1d\\frac{\\mathrm d[\\ce{D}]}{\\mathrm dt}\n=-\\frac1e\\frac{\\mathrm d[\\ce{E}]}{\\mathrm dt}\n=\\frac1g\\frac{\\mathrm d[\\ce{G}]}{\\mathrm dt}\n=\\frac1h\\frac{\\mathrm d[\\ce{H}]}{\\mathrm dt}\n}', display: true },
  { tex: '-\\mathrm d[\\ce{H2}]/\\mathrm dt', display: false },
  { tex: 'r\\propto[\\ce{D}]^d[\\ce{E}]^e', display: true },
  { tex: '\\ce{A + B -> P}', display: true },
  { tex: '\\ce{H2 + I2 -> 2HI}', display: false },
  { tex: "r=\\dfrac{k[\\ce{H2}][\\ce{Br2}]^{1/2}}{1+k'[\\ce{HBr}]/[\\ce{Br2}]}", display: false },
  { tex: 'r=k[\\ce{H2}][\\ce{Cl2}]^{1/2}', display: false },
];
