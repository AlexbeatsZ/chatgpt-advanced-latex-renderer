// Shared formula fixtures (used by engine unit tests and the e2e mock page).
export interface Case {
  group: string;
  tex: string;
  display: boolean;
}

const c = (group: string, tex: string, display = false): Case => ({ group, tex, display });

export const CASES: Case[] = [
  // 1. basics
  c('basic', 'E=mc^2'),
  c('basic', '\\int_0^1 x^2\\,\\mathrm{d}x=\\frac13', true),
  c('basic', '\\sum_{n=1}^{\\infty}\\frac{1}{n^2}=\\frac{\\pi^2}{6}', true),
  c('basic', '\\boxed{E=E^\\circ-\\frac{RT}{nF}\\ln Q}', true),
  c('basic', '\\text{速率 } r = k[\\mathrm{A}]^m[\\mathrm{B}]^n'),
  c('basic', '\\operatorname{rank}(\\mathbf{A}) \\quad \\boldsymbol{\\mu}'),
  // 2. multi-line & matrices
  c('align', '\\begin{aligned} a&=b+c\\\\ d&=e \\end{aligned}', true),
  c('align', '\\begin{align} x&=1 \\\\ y&=2 \\end{align}', true),
  c('align', '\\begin{gather} a=b \\\\ c=d \\end{gather}', true),
  c('align', 'f(x)=\\begin{cases} x^2 & x\\ge 0\\\\ -x & x<0 \\end{cases}', true),
  c('align', '\\begin{split} a &= b \\\\ &= c \\end{split}', true),
  c('matrix', '\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}\\begin{matrix}1&2\\end{matrix}', true),
  c('matrix', '\\sum_{\\substack{0<i<m\\\\0<j<n}} P(i,j)', true),
  c('matrix', '\\begin{pmatrix*}[r] -1 & 2 \\\\ 3 & -4 \\end{pmatrix*}', true),
  // 3/4. chemistry
  c('mhchem', '\\ce{H2O}'),
  c('mhchem', '\\ce{2H2 + O2 -> 2H2O}', true),
  c('mhchem', '\\ce{Fe^3+ + e- -> Fe^2+}', true),
  c('mhchem', '\\ce{Fe^{3+} + e- -> Fe^{2+}}', true),
  c('mhchem', '\\ce{A <=> B}', true),
  c('mhchem', '\\ce{M.}'),
  c('mhchem', '\\ce{M^{+.}}'),
  c('mhchem', '\\ce{CH3^.}'),
  c('mhchem', '\\pu{25 kJ mol-1}'),
  c('mhchem', '\\ce{CO2 + C ->[\\alpha][\\beta] 2CO}', true),
  c('mhchem', '\\ce{MnO4- + 8H+ + 5e- -> Mn^2+ + 4H2O}', true),
  c('mhchem', '\\ce{SO4^2- + Ba^2+ -> BaSO4 v}'),
  c('mhchem', '\\ce{^{227}_{90}Th+}'),
  c('mhchem', 'E=E^\\circ+\\frac{RT}{F}\\ln\\frac{a_{\\ce{Fe^{3+}}}}{a_{\\ce{Fe^{2+}}}}', true),
  c('mhchem', '\\Delta_r H^\\ominus = \\pu{-285.8 kJ mol-1}'),
  // 5. physics
  c('physics', '\\dv{y}{t}=v(t)'),
  c('physics', '\\pdv{f}{x}=2x,\\qquad \\pdv[2]{f}{x}{y}', true),
  c('physics', '\\dd{x}\\,\\dd[3]{r}'),
  c('physics', '\\qty(\\frac{a+b}{c})^2'),
  c('physics', '\\vb{F}=m\\vb{a},\\ \\vu{n}'),
  c('physics', '\\bra{\\psi}\\ket{\\phi}=\\braket{\\psi}{\\phi}'),
  c('physics', '\\braket{\\psi|\\phi}'),
  c('physics', '\\braket{m|\\hat H|n}'),
  c('physics', '\\abs{x}+\\norm{\\vb{v}}+\\comm{A}{B}'),
  c('physics', '\\expval{\\hat{H}}{\\psi}'),
  c('physics', '\\grad{\\phi}+\\curl{\\vb{A}}+\\laplacian{u}'),
  c('physics', '\\mqty(a & b \\\\ c & d)'),
  // siunitx subset / conflict resolution
  c('siunitx', '\\qty{25}{kJ.mol^{-1}}'),
  c('siunitx', '\\qty{1.5e-3}{\\kilo\\joule\\per\\mole}'),
  c('siunitx', '\\SI{298.15}{\\kelvin}'),
  c('siunitx', '\\si{\\joule\\per\\mole\\per\\kelvin}'),
  // other extensions
  c('ext', '\\cancel{x}+\\bcancel{y}+\\xcancel{z}'),
  c('ext', '\\set{x | x>0}'),
  c('ext', '\\coloneqq \\quad \\xrightarrow[\\text{cat.}]{\\Delta}'),
  c('ext', '\\begin{empheq}[left=\\empheqlbrace]{align} a&=b \\\\ c&=d \\end{empheq}', true),
  c('ext', '\\color{red}{x}+\\textcolor{blue}{y}'),
  c('ext', '\\mathbb{R}\\ \\mathcal{L}\\ \\mathfrak{g}\\ \\mathscr{F}'),
  c('ext', '\\newcommand{\\RR}{\\mathbb{R}} \\RR^n'),
  c('ext', '\\DeclareMathOperator{\\Tr}{Tr} \\Tr(\\rho)'),
  c('ext', '\\SI{5}{\\celsius}'.replace('\\celsius', '\\degreeCelsius')),
  c('ext', '\\upalpha\\ \\degree'),
  c('ext', '\\text{中文与 English 混排 } x^2'),
];
