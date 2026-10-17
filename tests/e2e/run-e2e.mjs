// End-to-end tests: real Chromium + the built extension (dist/) + SIMULATED ChatGPT pages served
// at https://chatgpt.com/ through Playwright request interception. This verifies injection,
// MathJax rendering, observer behaviour and DOM safety in a real browser; it is NOT a test of
// the live chatgpt.com DOM (see scripts/probe-chatgpt.mjs and README "验证状态").
//
// Usage: pnpm build && node tests/e2e/run-e2e.mjs [--headed] [--only name]
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import * as F from '../fixtures/chatgpt-page.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const headed = args.includes('--headed');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const outDir = path.join(root, 'test-results');
fs.mkdirSync(outDir, { recursive: true });

// ---------------------------------------------------------------- extension copy
// A test-only service worker is added to a COPY of dist/ so tests can read the extension id
// and write chrome.storage; the shipped extension has no background script.
const extDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alr-ext-'));
fs.cpSync(path.join(root, 'dist'), extDir, { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.json'), 'utf8'));
manifest.background = { service_worker: 'e2e-sw.js' };
fs.writeFileSync(path.join(extDir, 'manifest.json'), JSON.stringify(manifest));
fs.writeFileSync(path.join(extDir, 'e2e-sw.js'), 'self.addEventListener("install", () => self.skipWaiting());');

// ---------------------------------------------------------------- fixture pages
const katexDir = path.dirname(require.resolve('katex/package.json'));
const pages = {};
const original = {}; // page -> thread innerHTML as served
function addPage(name, turns, opts) {
  pages[name] = F.page(turns, opts);
  original[name] = turns.join('\n');
}

const mainTurns = [
  F.userTurn(0, '请讲解能斯特方程，$x$ 用 \\ce{} 写'),
  F.assistantTurn(0, [
    F.para(`能斯特方程 ${F.inlineMath('E=E^\\circ-\\frac{RT}{nF}\\ln Q')}，其中 ${F.inlineMath('Q')} 为反应商。`),
    F.blockMath('\\ce{Fe^{3+} + e- -> Fe^{2+}}'),
    F.blockMath('\\ce{A <=> B}'),
    F.para(`自由基阳离子 ${F.inlineMath('\\ce{M^{+.}}')}，单位 ${F.inlineMath('\\pu{25 kJ mol-1}')}，还有 ${F.inlineMath('\\ce{M.}')}`),
    F.blockMath('\\pdv{f}{x}=2x,\\qquad \\dv{y}{t}=v'),
    F.blockMath('\\bra{\\psi}\\ket{\\phi}=\\braket{\\psi|\\phi}'),
    F.blockMath('\\begin{aligned} a&=b+c\\\\ d&=e \\end{aligned}'),
    F.blockMath('\\begin{pmatrix}1&0\\\\0&1\\end{pmatrix}'),
    F.para(F.text('原文公式：$a+b=c$，以及 \\(\\ce{2H2 + O2 -> 2H2O}\\)。售价 $5 到 $10。转义 \\$3。')),
    F.para(F.text('讲解语法：使用 \\(...\\) 和 \\[...\\]。')),
    F.para(`行内代码 <code>$z$</code> 不渲染`),
    F.codeBlock('s = "$x^2$"\nprint(r"\\(y\\)")'),
    F.list([F.text('列表项 $\\alpha$'), F.text('嵌套 \\(\\beta\\)') + F.list([F.text('更深 $\\gamma$')])]),
    F.table([[F.text('$\\Delta H$'), F.text('\\(\\pu{-285.8 kJ mol-1}\\)')], ['普通', F.text('$5 and $6')]]),
    F.para(F.text('中文与 English 混排：速率常数 $k = A\\,\\mathrm{e}^{-E_a/RT}$。')),
    // ```latex block whose ChatGPT preview failed (source verbatim from chatgpt.com)
    F.latexCodeBlock('% 酸性条件下高锰酸根的还原半反应\n\\ce{MnO4^- + 8H+ + 5e- -> Mn^2+ + 4H2O}\n\n% Fe3+/Fe2+ 电对\n\\ce{Fe^3+ + e- <=> Fe^2+}\n\n% 标准反应焓示例\n\\pu{-285.8 kJ mol-1}'),
  ]),
];
addPage('main', mainTurns);
addPage('dark', mainTurns, { dark: true });
addPage(
  'quiz',
  [
    F.assistantTurn(0, [
      '<div data-d-component="box"><p>题 1：对于反应 \\(\\ce{2A -> B}\\)，速率等于多少？</p><div role="radiogroup"><div data-d-component="radio"><label for="r1"><div><button type="button" role="radio" id="r1" aria-checked="false"></button></div>\\(k[\\ce{A}]^2\\)</label></div></div></div>' +
        '<script>window.__quizClicks=0;document.getElementById("r1").addEventListener("click",function(){window.__quizClicks++;this.setAttribute("aria-checked","true");this.parentElement.setAttribute("data-state","checked");});</script>',
    ]),
  ],
);
// An earlier answer with a \ce formula: the engine is already loaded when streaming starts,
// as on a real page after the first formula.
addPage('stream', [F.assistantTurn(0, [F.blockMath('\\ce{H2O}')]), F.assistantTurn(1, [F.para('<span id="s"></span>')])]);

const longTurns = [];
for (let i = 0; i < 60; i++) {
  longTurns.push(F.userTurn(i, `问题 ${i}`));
  longTurns.push(
    F.assistantTurn(i, [
      F.para(`第 ${i} 轮：${F.inlineMath('x_' + i + '^2')} 与 ${F.inlineMath('\\ce{H2O}')}`),
      F.blockMath(`\\ce{${i % 5 + 1}H2 + O2 -> 2H2O}`),
      F.blockMath(`\\int_0^{${i}} t\\,\\mathrm{d}t = \\frac{${i}^2}{2}`),
      F.para(F.text(`原文 $y_{${i}}$ 和 \\(\\pdv{f}{x_${i}}\\)`)),
      F.blockMath('\\sum_{n=1}^{\\infty}\\frac{1}{n^2}=\\frac{\\pi^2}{6}'),
    ]),
  );
}
addPage('long', longTurns);
addPage('long-inner', longTurns, { innerScroll: true });

// ---------------------------------------------------------------- runner
const results = [];
const external = [];
let ctx;
let extId;

async function setup() {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alr-profile-'));
  const exe = process.env.CHROMIUM_PATH || findChromium();
  ctx = await chromium.launchPersistentContext(userDir, {
    // Extensions need full Chromium; the default headless shell cannot load them.
    ...(exe ? { executablePath: exe } : { channel: 'chromium' }),
    headless: !headed,
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`, '--lang=zh-CN'],
    viewport: { width: 1100, height: 900 },
  });
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'chrome-extension:') return route.continue();
    if (url.hostname !== 'chatgpt.com') {
      external.push(url.href);
      return route.abort();
    }
    if (url.pathname.startsWith('/__fixture/')) {
      const rel = url.pathname.replace('/__fixture/', '');
      const file = rel === 'katex.css' ? path.join(katexDir, 'dist/katex.min.css') : path.join(katexDir, 'dist', rel);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream';
      return route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': type } });
    }
    const name = url.pathname.replace(/^\/+/, '') || 'main';
    if (!pages[name]) return route.fulfill({ status: 404, body: 'no fixture' });
    return route.fulfill({ status: 200, body: pages[name], headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  extId = new URL(sw.url()).host;
}

async function setSettings(patch) {
  const sw = ctx.serviceWorkers()[0];
  await sw.evaluate(async (p) => {
    const cur = (await chrome.storage.local.get('alrSettings')).alrSettings ?? {};
    await chrome.storage.local.set({ alrSettings: { ...cur, ...p } });
  }, patch);
}

async function resetSettings() {
  await ctx.serviceWorkers()[0].evaluate(() => chrome.storage.local.clear());
}

async function open(name) {
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.text().includes('[ALR]')) console.log(`   [console:${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log('   [pageerror]', e.message));
  await page.goto(`https://chatgpt.com/${name === 'main' ? '' : name}`);
  return page;
}

/** Waits until the extension has processed the page (no queued work, engine loaded if needed). */
async function settle(page, ms = 600) {
  await page.waitForTimeout(ms);
  await page.waitForFunction(() => document.querySelectorAll('alr-math').length >= 0, null, { timeout: 5000 });
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('alr-math').length + document.querySelectorAll('[data-alr-hidden], alr-text').length * 1000);
    if (n === last) return;
    last = n;
    await page.waitForTimeout(250);
  }
}

const inspect = (page) =>
  page.evaluate(() => {
    const visibleKatex = [...document.querySelectorAll('.katex')].filter((k) => k.getClientRects().length > 0 && !k.closest('[data-alr-hidden]'));
    const alr = [...document.querySelectorAll('alr-math')].filter((m) => m.getClientRects().length > 0);
    return {
      alr: alr.length,
      alrTex: alr.map((m) => m.getAttribute('data-alr-tex')),
      alrFromKatex: alr.filter((m) => m.getAttribute('data-alr-src') === 'katex').length,
      alrFromText: alr.filter((m) => m.getAttribute('data-alr-src') === 'text').length,
      visibleKatex: visibleKatex.length,
      visibleKatexTex: visibleKatex.map((k) => k.querySelector('annotation')?.textContent),
      hidden: document.querySelectorAll('[data-alr-hidden]').length,
      missingGlyphs: [...document.querySelectorAll('alr-math svg text')].filter((t) => !t.textContent || /[-]/.test(t.textContent)).length,
      errors: [...document.querySelectorAll('[data-alr-state="error"]')].map((e) => e.getAttribute('data-alr-error')),
      codeText: document.querySelector('.cm-content')?.textContent,
      inlineCode: [...document.querySelectorAll('code')].map((c) => c.textContent),
      composer: document.getElementById('composer')?.innerHTML,
      visibleText: document.getElementById('thread')?.innerText,
    };
  });

async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try {
    await resetSettings();
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t0 });
    console.log(`✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, ms: Date.now() - t0, error: e.message });
    console.log(`✗ ${name}\n   ${e.stack?.split('\n').slice(0, 3).join('\n   ')}`);
  } finally {
    for (const p of ctx.pages()) if (p.url().startsWith('https://chatgpt.com')) await p.close().catch(() => {});
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

// ---------------------------------------------------------------- tests
await setup();
console.log(`extension ${extId} loaded from ${extDir}\n`);

await test('compat mode: only failed/preferred formulas upgraded, raw text rendered, code untouched', async () => {
  const page = await open('main');
  await settle(page, 1500);
  const r = await inspect(page);
  // KaTeX formulas with \ce / \pu (red in KaTeX) or physics commands must be replaced.
  for (const t of ['\\bra{\\psi}\\ket{\\phi}=\\braket{\\psi|\\phi}', '\\ce{Fe^{3+} + e- -> Fe^{2+}}', '\\ce{A <=> B}', '\\ce{M^{+.}}', '\\pu{25 kJ mol-1}', '\\ce{M.}', '\\pdv{f}{x}=2x,\\qquad \\dv{y}{t}=v']) {
    assert(r.alrTex.includes(t), `expected MathJax for ${t}; got ${JSON.stringify(r.alrTex)}`);
    assert(!r.visibleKatexTex.includes(t), `KaTeX for ${t} still visible (duplicate)`);
  }
  // Correct KaTeX stays native in compat mode.
  for (const t of ['E=E^\\circ-\\frac{RT}{nF}\\ln Q', 'Q', '\\begin{aligned} a&=b+c\\\\ d&=e \\end{aligned}']) {
    assert(r.visibleKatexTex.includes(t), `native KaTeX for ${t} should be kept in compat mode`);
  }
  // Raw text formulas.
  for (const t of ['a+b=c', '\\ce{2H2 + O2 -> 2H2O}', '\\alpha', '\\beta', '\\gamma', '\\Delta H', '\\pu{-285.8 kJ mol-1}', 'k = A\\,\\mathrm{e}^{-E_a/RT}']) {
    assert(r.alrTex.includes(t), `raw formula ${t} not rendered; got ${JSON.stringify(r.alrTex)}`);
  }
  assert(!r.alrTex.includes('...'), 'placeholder "\\(...\\)" must not be rendered');
  assert(r.visibleText.includes('售价 $5 到 $10'), 'currency text changed');
  assert(r.visibleText.includes('$5 and $6'), 'currency in table changed');
  assert(r.visibleText.includes('\\$3') || r.visibleText.includes('$3'), 'escaped dollar text changed');
  eq(r.codeText, 's = "$x^2$"print(r"\\(y\\)")', 'code block text');
  assert(r.inlineCode.includes('$z$'), 'inline code changed');
  assert(r.composer.includes('$x^2$ draft'), 'composer changed');
  eq(r.missingGlyphs, 0, 'missing glyphs in SVG');
  eq(r.errors, [], 'render errors');
  const cb = await page.evaluate(() => {
    const m = document.querySelector('alr-math[data-alr-src="codeblock"]');
    return {
      lines: m ? m.querySelectorAll('alr-text.alr-line mjx-container').length : -1,
      alertHidden: document.querySelector('[data-code-block-preview] > [data-alr-hidden] aside[role=alert]') !== null,
      insidePreview: !!m?.parentElement?.hasAttribute('data-code-block-preview'),
    };
  });
  eq(cb, { lines: 3, alertHidden: true, insidePreview: true }, 'failed ```latex preview replaced by MathJax (3 formulas)');
  await page.screenshot({ path: path.join(outDir, 'compat-light.png'), fullPage: true });
});

await test('user messages are not processed by default, and are when enabled', async () => {
  await setSettings({ userMessages: false });
  let page = await open('main');
  await settle(page, 1200);
  let user = await page.evaluate(() => document.querySelector('[data-content-search-unit-key$=":user"]').querySelectorAll('alr-math').length);
  eq(user, 0, 'alr-math inside user message (disabled)');
  await page.close();
  await setSettings({ userMessages: true });
  page = await open('main');
  await settle(page, 1200);
  user = await page.evaluate(() => document.querySelectorAll('[data-content-search-unit-key$=":user"] alr-math').length);
  eq(user, 1, 'alr-math inside user message (enabled)');
});

await test('full MathJax mode: every recoverable KaTeX formula is replaced exactly once', async () => {
  await setSettings({ mode: 'full' });
  const page = await open('main');
  await settle(page, 1500);
  const r = await inspect(page);
  eq(r.visibleKatex, 0, 'visible KaTeX left in full mode');
  const katexTotal = await page.evaluate(() => document.querySelectorAll('.katex').length);
  eq(r.alrFromKatex, katexTotal, 'one MathJax node per KaTeX formula');
  eq(r.missingGlyphs, 0, 'missing glyphs');
  // Inline vs display semantics are preserved.
  const kinds = await page.evaluate(() =>
    [...document.querySelectorAll('alr-math[data-alr-src="katex"]')].map((m) => [m.getAttribute('data-alr-display'), getComputedStyle(m).display]),
  );
  assert(kinds.some(([d, c]) => d === 'block' && c === 'block') && kinds.some(([d, c]) => d === 'inline' && c === 'inline-block'), 'display/inline semantics');
  await page.screenshot({ path: path.join(outDir, 'full-light.png'), fullPage: true });
});

await test('baseline and size: inline MathJax sits on the text baseline, size follows the scale setting', async () => {
  await setSettings({ mode: 'full' });
  let page = await open('main');
  await settle(page, 1500);
  const m1 = await page.evaluate(() => {
    const el = document.querySelector('alr-math[data-alr-display="inline"][data-alr-tex="Q"]');
    const p = el.closest('p');
    const svg = el.querySelector('svg');
    const pr = p.getBoundingClientRect();
    const r = svg.getBoundingClientRect();
    return { h: r.height, top: r.top - pr.top, lineH: parseFloat(getComputedStyle(p).lineHeight), fs: parseFloat(getComputedStyle(p).fontSize) };
  });
  assert(m1.h > m1.fs * 0.5 && m1.h < m1.fs * 1.6, `inline "Q" height ${m1.h}px vs font ${m1.fs}px`);
  await page.close();
  await setSettings({ mode: 'full', scale: 150 });
  page = await open('main');
  await settle(page, 1500);
  const h2 = await page.evaluate(() => document.querySelector('alr-math[data-alr-tex="Q"] svg').getBoundingClientRect().height);
  assert(Math.abs(h2 / m1.h - 1.5) < 0.12, `scale 150% -> height ratio ${(h2 / m1.h).toFixed(2)}`);
});

await test('dark mode: formulas inherit the light text colour', async () => {
  await setSettings({ mode: 'full' });
  const page = await open('dark');
  await settle(page, 1500);
  const c = await page.evaluate(() => {
    const m = document.querySelector('alr-math[data-alr-src="katex"]');
    const g = m.querySelector('svg g[stroke]');
    return { text: getComputedStyle(m.closest('p, div')).color, svgFill: getComputedStyle(g).fill, attr: g.getAttribute('fill') };
  });
  eq(c.attr, 'currentColor', 'svg uses currentColor');
  eq(c.svgFill, c.text, 'svg fill equals text colour');
  await page.screenshot({ path: path.join(outDir, 'full-dark.png'), fullPage: true });
});

await test('disable restores the original DOM exactly; re-enable renders again; state survives reload', async () => {
  const page = await open('main');
  await settle(page, 1500);
  assert((await inspect(page)).alr > 0, 'nothing rendered before disabling');
  await setSettings({ enabled: false });
  await page.waitForTimeout(800);
  const html = await page.evaluate(() => document.getElementById('thread').innerHTML);
  const norm = (s) => s.replace(/\s+/g, ' ').replace(/> </g, '><').trim();
  // Compare via DOM serialization of the served markup (browser normalizes attributes the same way).
  const served = await page.evaluate((h) => {
    const d = document.createElement('div');
    d.innerHTML = h;
    return d.innerHTML;
  }, original.main);
  eq(norm(html) === norm(served), true, 'DOM after disable equals served DOM');
  await page.reload();
  await page.waitForTimeout(1200);
  eq((await inspect(page)).alr, 0, 'stays disabled after reload');
  await setSettings({ enabled: true });
  await settle(page, 1500);
  assert((await inspect(page)).alr > 5, 're-enabled renders again');
  await page.reload();
  await settle(page, 1500);
  assert((await inspect(page)).alr > 5, 'enabled state survives reload');
});

await test('mode switch and re-render never duplicate formulas', async () => {
  const page = await open('main');
  await settle(page, 1500);
  const a = await inspect(page);
  await setSettings({ mode: 'full' });
  await settle(page, 1200);
  await setSettings({ mode: 'compat' });
  await settle(page, 1200);
  const b = await inspect(page);
  eq(b.alr, a.alr, 'same number of MathJax nodes after full->compat');
  eq(b.visibleKatex, a.visibleKatex, 'same number of native formulas');
  const dup = await page.evaluate(() => {
    const seen = new Map();
    for (const m of document.querySelectorAll('alr-math[data-alr-src="katex"]')) {
      const prev = m.previousElementSibling;
      seen.set(prev, (seen.get(prev) ?? 0) + 1);
    }
    return Math.max(0, ...seen.values());
  });
  assert(dup <= 1, 'a KaTeX formula has more than one MathJax replacement');
});

await test('streaming: formulas appear when complete, partial ones stay raw, no per-token full re-render', async () => {
  const page = await open('stream');
  await settle(page, 1200);
  const base = (await inspect(page)).alr; // the pre-existing \ce formula
  const tokens = '速率方程 \\( r = k[\\mathrm{A}]^2 \\) 中，反应 \\(\\ce{2NO2 -> N2O4}\\) 的 $k$ 与温度有关，但 \\(x + 尚未结束'.split(/(?<=\s)|(?=\\\()/);
  // Count how many times our nodes are (re)applied to detect per-token re-rendering.
  await page.evaluate(() => {
    window.__applies = 0;
    new MutationObserver((recs) => {
      if (recs.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && n.tagName === 'ALR-MATH'))) window.__applies++;
    }).observe(document.body, { childList: true, subtree: true });
  });
  const push = (w) =>
    page.evaluate((w) => {
      const s = document.createElement('span');
      s.setAttribute('data-d-stream-word', '');
      s.textContent = w;
      document.getElementById('s').appendChild(s);
    }, w);
  // Phase 1: the first formula is complete, the second one is still being typed.
  const cut = tokens.findIndex((t) => t.includes('\\ce{2NO2')) + 1;
  for (const t of tokens.slice(0, cut)) {
    await push(t);
    await page.waitForTimeout(60); // ~16 tokens/s
  }
  await push('->'); // inside the unfinished \(\ce{...
  await settle(page, 1200); // a pause in the stream
  const mid = await inspect(page);
  eq(mid.alr - base, 1, 'only the completed formula is rendered mid-stream');
  assert(mid.visibleText.includes('\\(\\ce{2NO2'), 'the unfinished formula stays raw mid-stream');
  // Phase 2: the rest of the answer (the stray "->" token is removed again, like a re-tokenized word).
  await page.evaluate(() => document.getElementById('s').lastElementChild.remove());
  for (const t of tokens.slice(cut)) {
    await push(t);
    await page.waitForTimeout(60);
  }
  await settle(page, 1200);
  const r = await inspect(page);
  for (const t of ['r = k[\\mathrm{A}]^2', '\\ce{2NO2 -> N2O4}', 'k']) assert(r.alrTex.includes(t), `streamed formula ${t} missing: ${JSON.stringify(r.alrTex)}`);
  eq(r.alr - base, 3, 'each streamed formula rendered exactly once');
  assert(r.visibleText.includes('\\(x + 尚未结束'), 'incomplete formula must remain raw text');
  const applies = await page.evaluate(() => window.__applies);
  assert(applies < tokens.length / 2, `re-applied ${applies} times for ${tokens.length} tokens (batching not effective)`);
  console.log(`   tokens=${tokens.length} applies=${applies}`);
});

await test('React-style updates: text rewrite, element replacement, innerHTML reset -> no orphans or duplicates', async () => {
  const page = await open('main');
  await settle(page, 1500);
  const RAW = '原文公式：$a+b=c$，以及 \\(\\ce{2H2 + O2 -> 2H2O}\\)。售价 $5 到 $10。转义 \\$3。';
  await page.evaluate((raw) => {
    const p = [...document.querySelectorAll('p')].find((e) => e.textContent.includes('原文公式'));
    // 1) React sets nodeValue on the text node we modified (same text + more).
    const t = [...p.childNodes].find((n) => n.nodeType === 3);
    t.data = raw + ' 追加 $z^2$';
  }, RAW);
  await settle(page, 1200);
  let r = await inspect(page);
  assert(r.alrTex.includes('z^2') && r.alrTex.filter((x) => x === 'a+b=c').length === 1, `after text rewrite: ${JSON.stringify(r.alrTex)}`);
  await page.evaluate((raw) => {
    // 2) React replaces the paragraph element with a fresh one.
    const p = [...document.querySelectorAll('p')].find((e) => e.textContent.includes('原文公式'));
    const fresh = document.createElement('p');
    fresh.textContent = raw;
    p.replaceWith(fresh);
    // 3) React resets a math container's innerHTML (KaTeX re-render).
    const block = document.querySelector('[data-alr-hidden]').parentElement;
    block.innerHTML = block.innerHTML.replace(/ data-alr-hidden=""/g, '').replace(/<alr-math[\s\S]*?<\/alr-math>/g, '');
  }, RAW);
  await settle(page, 1500);
  r = await inspect(page);
  eq(r.alrTex.filter((x) => x === 'a+b=c').length, 1, 'raw paragraph rendered once after replacement');
  const orphans = await page.evaluate(() =>
    [...document.querySelectorAll('alr-math[data-alr-src="katex"]')].filter((m) => !m.previousElementSibling?.hasAttribute('data-alr-hidden')).length,
  );
  eq(orphans, 0, 'orphan MathJax nodes');
  const dups = await page.evaluate(() => document.querySelectorAll('[data-alr-hidden] + alr-math + alr-math').length);
  eq(dups, 0, 'duplicate MathJax nodes');
  assert(r.visibleText.includes('售价 $5 到 $10'), 'currency still intact');
});

await test('interactive widgets keep working (quiz radio inside <label>)', async () => {
  const page = await open('quiz');
  await settle(page, 1500);
  const r = await inspect(page);
  assert(r.alrTex.includes('k[\\ce{A}]^2'), `option formula rendered: ${JSON.stringify(r.alrTex)}`);
  // Clicking the rendered option must still reach the page's own control and its handler.
  const box = await page.evaluate(() => {
    const m = [...document.querySelectorAll('label alr-math')][0];
    const b = m.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(300);
  const state = await page.evaluate(() => ({ checked: document.getElementById('r1').getAttribute('aria-checked'), clicks: window.__quizClicks }));
  eq(state, { checked: 'true', clicks: 1 }, 'quiz control reacted to the click');
  await page.waitForTimeout(600);
  eq((await inspect(page)).alr, 2, 'no duplicate after the widget re-rendered its state');
});

await test('selection copy yields LaTeX; Alt+click copies source', async () => {
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://chatgpt.com' });
  const page = await open('main');
  await settle(page, 1500);
  const sel = await page.evaluate(() => {
    const p = [...document.querySelectorAll('p')].find((c) => c.textContent.includes('原文公式'));
    const range = document.createRange();
    range.selectNodeContents(p);
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(range);
    return s.toString();
  });
  assert(sel.includes('$a+b=c$') && sel.includes('\\ce{2H2 + O2 -> 2H2O}'), `selection text: ${sel}`);
  const box = await page.evaluate(() => {
    const m = [...document.querySelectorAll('alr-math')].find((e) => e.getAttribute('data-alr-tex') === '\\ce{A <=> B}');
    m.scrollIntoView({ block: 'center' });
    const r = m.querySelector('svg').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.keyboard.down('Alt');
  await page.mouse.click(box.x, box.y);
  await page.keyboard.up('Alt');
  await page.waitForTimeout(200);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  eq(clip, '\\ce{A <=> B}', 'clipboard after Alt+click');
});

await test('no network requests outside chatgpt.com (no CDN, no telemetry)', async () => {
  const before = external.length;
  const page = await open('main');
  await settle(page, 1500);
  await setSettings({ mode: 'full' });
  await settle(page, 1500);
  eq(external.slice(before), [], 'external requests');
});

await test('long conversation: lazy, batched rendering stays responsive', async () => {
  await setSettings({ mode: 'full' });
  const page = await open('long');
  const t0 = Date.now();
  await page.evaluate(() => {
    window.__longTasks = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__longTasks.push(e.duration))).observe({ type: 'longtask', buffered: true });
  });
  await settle(page, 2500);
  const first = await page.evaluate(() => ({
    total: document.querySelectorAll('.katex').length,
    done: document.querySelectorAll('alr-math[data-alr-src="katex"]').length,
    raw: document.querySelectorAll('alr-math[data-alr-src="text"]').length,
  }));
  const tFirst = Date.now() - t0;
  assert(first.done > 0 && first.done < first.total, `lazy rendering expected (done ${first.done}/${first.total})`);
  for (let i = 0; i < 40; i++) {
    await page.mouse.wheel(0, 2500);
    await page.waitForTimeout(120);
  }
  await settle(page, 2000);
  const all = await page.evaluate(() => ({
    total: document.querySelectorAll('.katex').length,
    done: document.querySelectorAll('alr-math[data-alr-src="katex"]').length,
    raw: document.querySelectorAll('alr-math[data-alr-src="text"]').length,
    longTasks: window.__longTasks,
  }));
  eq(all.done, all.total, 'all KaTeX formulas rendered after scrolling');
  eq(all.raw, 120, 'all raw formulas rendered');
  const worst = Math.max(0, ...all.longTasks);
  console.log(`   formulas=${all.total}+${all.raw} initial(${first.done} rendered) ${tFirst} ms; longest task ${worst.toFixed(0)} ms; long tasks ${all.longTasks.length}`);
});

await test('inner scroll container (like chatgpt.com): formulas below the fold are pre-rendered', async () => {
  await setSettings({ mode: 'full' });
  const page = await open('long-inner');
  await settle(page, 2500);
  const check = () =>
    page.evaluate(() => {
      const sc = document.getElementById('scroller');
      const h = sc.clientHeight;
      const top0 = sc.getBoundingClientRect().top;
      const below = [...document.querySelectorAll('.katex-display, .katex')]
        .filter((k) => !(k.matches('.katex') && k.parentElement.closest('.katex-display')))
        .map((k) => {
          const hidden = k.hasAttribute('data-alr-hidden');
          // hidden units have no box: measure their MathJax replacement instead
          const box = (hidden ? k.nextElementSibling : k).getBoundingClientRect();
          return { y: box.top - top0, hidden };
        })
        .filter((u) => u.y > h && u.y < h + 900);
      return { n: below.length, pending: below.filter((u) => !u.hidden).length };
    });
  let r = await check();
  assert(r.n > 0, 'fixture should have formulas just below the fold');
  eq(r.pending, 0, 'formulas within 900px below the fold already rendered');
  await page.evaluate(() => document.getElementById('scroller').scrollBy(0, 4000));
  await settle(page, 1500);
  r = await check();
  eq(r.pending, 0, 'after scrolling, formulas below the new fold are pre-rendered too');
});

await test('popup renders and reports "not a ChatGPT tab" outside ChatGPT', async () => {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/popup.html`);
  await page.waitForTimeout(800);
  const t = await page.textContent('#engine-text');
  assert(t.includes('不是 ChatGPT'), `popup status text: ${t}`);
  assert(await page.isChecked('#enabled'), 'enabled checkbox');
  await page.screenshot({ path: path.join(outDir, 'popup.png') });
  await page.close();
});

await ctx.close();
fs.rmSync(extDir, { recursive: true, force: true });

const done = results.filter(Boolean);
const failed = done.filter((r) => !r.ok);
console.log(`\n${done.length - failed.length}/${done.length} e2e tests passed`);
fs.writeFileSync(path.join(outDir, 'e2e-results.json'), JSON.stringify(done, null, 1));
process.exit(failed.length ? 1 : 0);

function findChromium() {
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : [];
  for (const d of dirs) {
    const p = path.join(base, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}
