// Builds DOM that mirrors the structure observed on the real chatgpt.com (2026-10-17, see
// docs/design/chatgpt-dom.md), with formulas rendered by real KaTeX (throwOnError:false, as the
// page does). This is a SIMULATION used by unit and e2e tests - not a compatibility proof.
import katex from 'katex';

const k = (tex, display) => katex.renderToString(tex, { throwOnError: false, displayMode: display, output: 'htmlAndMathml' });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline formula as ChatGPT renders it. */
export const inlineMath = (tex) => `<span class="Math-C48SKy" data-d-component="math" data-d-stream-inline="">${k(tex, false)}</span>`;

/** Display formula as ChatGPT renders it. */
// The real block-math box is overflow:auto (horizontal scrolling of wide formulas).
export const blockMath = (tex) => `<div class="Math-C48SKy" data-d-block="" data-d-component="math" dir="ltr" style="overflow:auto">${k(tex, true)}</div>`;

/** Paragraph; `streamWords` splits text into per-word spans like during streaming. */
export function para(html, { streamWords = false } = {}) {
  const body = streamWords
    ? html.replace(/(^|>)([^<]+)(?=<|$)/g, (_, a, text) => a + text.split(/(?<=\s)/).map((w) => `<span data-d-text-flow="word" data-d-stream-word="">${w}</span>`).join(''))
    : html;
  return `<p class="TextBase-hXhSqg Text-lIMP0_" data-d-text-flow="" data-d-component="text">${body}</p>`;
}

export const text = esc;

/** Code block rendered as CodeMirror (as observed). */
export function codeBlock(code, lang = 'python') {
  const lines = code.split('\n').map((l) => `<div class="cm-line">${esc(l) || '<br>'}</div>`).join('');
  return `<div class="relative"><div class="InlineCodePane-EYx4bd"><div data-editor-search-surface="true"><div class="cm-editor ͼ1 ͼ2"><div class="cm-scroller"><div class="cm-content" contenteditable="true" role="textbox" data-language="${lang}">${lines}</div></div></div></div></div></div>`;
}

/**
 * ```latex code block with ChatGPT's preview. `ok` = preview rendered by KaTeX; otherwise the
 * preview is the "LaTeX 代码无效" alert (observed when KaTeX fails, e.g. on \ce).
 */
export function latexCodeBlock(src, { ok = false } = {}) {
  const preview = ok
    ? `<div>${k(src, true)}</div>`
    : `<div class="PreviewError-_CR6f8"><aside role="alert" class="alert"><div aria-hidden="true"></div><div><div><div class="flex"><div class="flex"><div>LaTeX 代码无效</div></div></div></div></div></aside></div>`;
  const attr = src.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `<div data-code-block="true" data-source-visible="false" data-markdown-copy="code-block" data-markdown-copy-text="${attr}" data-theme="dark"><div data-markdown-copy=""><div>LaTeX</div><button type="button">显示源代码</button></div><div data-code-block-source="" style="display:none"></div><div data-code-block-preview="" data-markdown-copy="">${preview}</div></div>`;
}

export const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
export const table = (rows) =>
  `<table><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

/** One assistant turn. */
export function assistantTurn(n, blocks) {
  return `<div data-content-search-unit-key="fallback-turn-${n}:2:assistant" data-chatgpt-search-unit-key="fallback-turn-${n}:2:assistant">
<h4 class="sr-only" data-conversation-role="assistant" tabindex="-1">ChatGPT 说：</h4>
<div><div class="group flex min-w-0 flex-col"><div dir="auto" data-markdown-text-style="assistant-message" class="MarkdownRoot-rZKhxa">
<div class="my-4" data-markdown-copy="contents"><div class="relative PortalBoundary-TFj9W2 Renderer-ojZscX" data-theme="dark">
<div dir="auto" class="DilRenderer-tB76Jj DilResponseRoot-HfQrEh" data-d-direction="col">${blocks.join('\n')}</div>
</div></div></div></div></div></div>`;
}

/** One user turn (plain text bubble). */
export function userTurn(n, plain) {
  return `<div data-content-search-unit-key="fallback-turn-${n}:0:user"><div data-user-message-bubble="true"><div class="text-size-chat whitespace-pre-wrap">${esc(plain)}</div></div></div>`;
}

export function page(turns, { dark = false, innerScroll = false } = {}) {
  if (innerScroll) {
    // Like chatgpt.com: the thread scrolls inside an element, not the window.
    return page(turns, { dark }).replace('<main>', '<div id="scroller" class="thread-scroll-container" style="height:100vh;overflow-y:auto"><main>').replace('</main>', '</main></div>');
  }
  return `<!doctype html><html lang="zh-CN" class="${dark ? 'dark' : 'light'}" style="color-scheme:${dark ? 'dark' : 'light'}"><head><meta charset="utf-8"><title>ChatGPT</title>
<style>
body{margin:0;font:16px/1.75 ui-sans-serif,system-ui,"Segoe UI","Microsoft YaHei",sans-serif;background:${dark ? '#212121' : '#fff'};color:${dark ? '#ececec' : '#0d0d0d'}}
main{max-width:760px;margin:0 auto;padding:24px}
.katex{font-size:1.21em}.katex-display{margin:1em 0;text-align:center}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}
.cm-editor{background:${dark ? '#171717' : '#f6f6f6'};padding:8px;font-family:monospace}
</style>
<link rel="stylesheet" href="https://chatgpt.com/__fixture/katex.css">
</head><body><main><div id="thread">${turns.join('\n')}</div>
<form><div contenteditable="true" class="ProseMirror" id="composer">$x^2$ draft in composer</div></form></main></body></html>`;
}
