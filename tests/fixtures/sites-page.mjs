// SIMULATED pages of other chat sites, built from the message markers in src/sites/sites.ts and
// the formula markup each site is known to use (docs/design/sites.md). Formulas are real KaTeX
// output. These check injection, scoping and the source-recovery paths in a real browser under
// the sites' security headers; they do not prove compatibility with the live sites.
import katex from 'katex';

const k = (tex, display, output = 'htmlAndMathml') => katex.renderToString(tex, { throwOnError: false, displayMode: display, output });
const attr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function shell(title, body) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title>
<link rel="stylesheet" href="/__fixture/katex.css">
</head><body><main><div id="thread">${body}</div>
<form><div contenteditable="true" id="composer">$x^2$ draft</div></form></main></body></html>`;
}

/** claude.ai: KaTeX with MathML; the user message and a raw $$...$$ left unrendered. */
export const claude = () =>
  shell(
    'Claude',
    `<div data-testid="user-message"><p>${esc('用户消息里的 $\\ce{H2O}$ 不处理')}</p></div>
<div class="font-claude-response"><div class="standard-markdown">
<p>反应 ${k('\\ce{2H2 + O2 -> 2H2O}', false)} 与 ${k('E=mc^2', false)}</p>
<div class="math math-display">${k('\\pu{-285.8 kJ mol-1}', true)}</div>
<p>${esc('未渲染的原文：\\(\\ce{NaCl}\\)')}</p>
</div></div>`,
  );

/** gemini.google.com: .math-inline / .math-block carry data-math; KaTeX HTML output only. */
export const gemini = () =>
  shell(
    'Gemini',
    `<user-query><p>q</p></user-query>
<model-response><message-content><div class="markdown">
<p>水 <span class="math-inline" data-math="\\ce{H2O}">${k('\\ce{H2O}', false, 'html')}</span>，能量 <span class="math-inline" data-math="E=h\\nu">${k('E=h\\nu', false, 'html')}</span></p>
<div class="math-block" data-math="${attr('\\ce{A <=> B}')}">${k('\\ce{A <=> B}', true, 'html')}</div>
</div></message-content></model-response>`,
  );

/** chat.deepseek.com: .ds-message > .ds-markdown with plain KaTeX. */
export const deepseek = () =>
  shell(
    'DeepSeek',
    `<div class="ds-message"><div class="fbb737a4">${esc('提问 $\\ce{X}$')}</div></div>
<div class="ds-message"><div class="ds-markdown"><p>速率 ${k('\\ce{A -> B}', false)}，常数 ${k('k', false)}</p>
${k('\\bra{\\psi}\\ket{\\phi}', true)}</div></div>`,
  );

/** chatgpt.com newer markup: <span role="math" data-math-source> with HTML-only KaTeX. */
export const chatgptMathSource = () =>
  shell(
    'ChatGPT',
    `<div data-content-search-unit-key="t-0:2:assistant"><div data-markdown-text-style="assistant-message">
<p>化学 <span role="math" data-math-source="${attr('\\ce{CO2}')}" data-client-katex-layout="">${k('\\ce{CO2}', false, 'html')}</span> 正常 <span role="math" data-math-source="a+b" data-client-katex-layout="">${k('a+b', false, 'html')}</span></p>
<div data-d-block=""><span role="math" data-math-source="${attr('\\ce{Fe^{3+} + e- -> Fe^{2+}}')}" data-client-katex-layout="">${k('\\ce{Fe^{3+} + e- -> Fe^{2+}}', true, 'html')}</span></div>
</div></div>`,
  );
