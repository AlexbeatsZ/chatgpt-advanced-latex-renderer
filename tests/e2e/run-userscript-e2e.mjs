// E2E for the USERSCRIPT build: real Chromium, SIMULATED ChatGPT pages at https://chatgpt.com/
// (Playwright interception), the built dist-userscript/*.user.js injected with a GM_* shim that
// stands in for Tampermonkey. Font requests to jsDelivr / GitHub raw are intercepted and served
// from userscript/fonts/ so the test is offline and can simulate failures. Tampermonkey itself is
// NOT exercised here.
//
// Usage: pnpm build:userscript && node tests/e2e/run-userscript-e2e.mjs [--headed]
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as F from '../fixtures/chatgpt-page.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const headed = process.argv.includes('--headed');
const outDir = path.join(root, 'test-results');
fs.mkdirSync(outDir, { recursive: true });
const script = fs.readFileSync(path.join(root, 'dist-userscript/chatgpt-advanced-latex-renderer.user.js'), 'utf8');
const version = /@version\s+(\S+)/.exec(script)[1];

const turns = [
  F.assistantTurn(0, [
    F.para(`能斯特方程 ${F.inlineMath('E=E^\\circ-\\frac{RT}{nF}\\ln Q')}`),
    F.blockMath('\\ce{Fe^{3+} + e- -> Fe^{2+}}'),
    F.blockMath('\\ce{A <=> B}'),
    F.blockMath('\\bra{\\psi}\\ket{\\phi}=\\braket{\\psi|\\phi}'),
    // glyphs outside the bundled base font -> dynamic ranges fetched as verified JSON
    F.blockMath('\\ce{X} \\mathfrak{g}\\ \\mathscr{F}\\ \\mathbb{R}^n\\ \\upalpha\\ \\leftrightarrows'),
    F.para(F.text('原文 $E=h\\nu$，售价 $5 到 $10。')),
    F.latexCodeBlock('% 半反应\n\\ce{MnO4^- + 8H+ + 5e- -> Mn^2+ + 4H2O}\n\n\\pu{-285.8 kJ mol-1}'),
    F.codeBlock('s = "$x^2$"'),
  ]),
];
const pageHtml = F.page(turns);

// GM_* shim: values persisted in the page's localStorage so reloads keep settings and font cache.
const shim = `
(() => {
  const P = 'gm:';
  window.GM_getValue = (k, d) => { const v = localStorage.getItem(P + k); return v === null ? d : JSON.parse(v); };
  window.GM_setValue = (k, v) => localStorage.setItem(P + k, JSON.stringify(v));
  window.GM_deleteValue = (k) => localStorage.removeItem(P + k);
  window.GM_listValues = () => Object.keys(localStorage).filter((k) => k.startsWith(P)).map((k) => k.slice(P.length));
  window.GM_addStyle = (css) => document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));
  window.__menu = {};
  window.GM_registerMenuCommand = (name, fn) => { window.__menu[name] = fn; };
  window.__gmFetches = [];
  window.GM_xmlhttpRequest = (d) => {
    window.__gmFetches.push(d.url);
    fetch(d.url).then(async (r) => d.onload({ status: r.status, responseText: await r.text() })).catch(() => d.onerror && d.onerror());
  };
})();
`;

const results = [];
let ctx;
let fontMode = 'ok'; // ok | jsdelivr-down | tampered
const external = [];

function assert(c, m) {
  if (!c) throw new Error(m);
}
const eq = (a, b, m) => assert(JSON.stringify(a) === JSON.stringify(b), `${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);

async function setup() {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'alr-us-'));
  const exe = process.env.CHROMIUM_PATH || findChromium();
  ctx = await chromium.launchPersistentContext(userDir, {
    ...(exe ? { executablePath: exe } : { channel: 'chromium' }),
    headless: !headed,
    viewport: { width: 1100, height: 900 },
  });
  await ctx.route('**/*', (route) => {
    const url = new URL(route.request().url());
    const fontMatch = /\/userscript\/fonts\/([\w-]+\.json)$/.exec(url.pathname);
    if ((url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'raw.githubusercontent.com') && fontMatch) {
      assert(url.href.includes(`v${version}`), `font URL not pinned to v${version}: ${url.href}`);
      if (fontMode === 'jsdelivr-down' && url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ status: 503, body: 'down' });
      let body = fs.readFileSync(path.join(root, 'userscript/fonts', fontMatch[1]), 'utf8');
      if (fontMode === 'tampered' && url.hostname === 'cdn.jsdelivr.net') body = body.replace('"p":"', '"p":"M0 0L9 9');
      return route.fulfill({ status: 200, body, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
    }
    if (url.hostname === 'chatgpt.com') {
      if (url.pathname.startsWith('/__fixture/')) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, body: pageHtml, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    external.push(url.href);
    return route.abort();
  });
}

async function open({ clear = true, preset } = {}) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('   [pageerror]', e.message));
  await page.goto('https://chatgpt.com/');
  if (clear) await page.evaluate(() => localStorage.clear());
  if (preset) await page.evaluate(preset);
  await page.addScriptTag({ content: shim + '\n' + script });
  return page;
}

async function settle(page, ms = 1500) {
  await page.waitForTimeout(ms);
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const n = await page.evaluate(() => document.querySelectorAll('alr-math, [data-alr-hidden], [data-alr-state]').length);
    if (n === last) return;
    last = n;
    await page.waitForTimeout(250);
  }
}

const inspect = (page) =>
  page.evaluate(() => ({
    alrTex: [...document.querySelectorAll('alr-math')].map((m) => m.getAttribute('data-alr-tex')),
    codeblockLines: document.querySelectorAll('alr-math[data-alr-src="codeblock"] alr-text.alr-line mjx-container').length,
    visibleRed: [...document.querySelectorAll('.katex')].filter((k) => k.getClientRects().length && k.querySelector('[mathcolor="#cc0000"]')).length,
    missingGlyphs: [...document.querySelectorAll('alr-math svg text')].filter((t) => !t.textContent || /[-]/.test(t.textContent)).length,
    errors: [...document.querySelectorAll('[data-alr-state="error"]')].map((e) => e.getAttribute('data-alr-error')),
    text: document.getElementById('thread').innerText,
    code: document.querySelector('.cm-content').textContent,
    runtime: document.documentElement.getAttribute('data-alr-runtime'),
    fetches: window.__gmFetches,
  }));

async function test(name, fn) {
  const t0 = Date.now();
  fontMode = 'ok';
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`✓ ${name} (${Date.now() - t0} ms)`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    console.log(`✗ ${name}\n   ${e.message}`);
  } finally {
    for (const p of ctx.pages()) if (p.url().startsWith('https://chatgpt.com')) await p.close().catch(() => {});
  }
}

await setup();
console.log(`userscript v${version} (${(script.length / 1024 / 1024).toFixed(2)} MiB)\n`);

await test('renders like the extension: \\ce, physics, raw $...$, ```latex preview; code and currency untouched', async () => {
  const page = await open();
  await settle(page);
  const r = await inspect(page);
  eq(r.runtime, 'userscript', 'runtime marker');
  for (const t of ['\\ce{Fe^{3+} + e- -> Fe^{2+}}', '\\ce{A <=> B}', '\\bra{\\psi}\\ket{\\phi}=\\braket{\\psi|\\phi}', 'E=h\\nu']) assert(r.alrTex.includes(t), `missing ${t}: ${JSON.stringify(r.alrTex)}`);
  eq(r.codeblockLines, 2, '```latex preview lines');
  eq(r.visibleRed, 0, 'visible red KaTeX');
  eq(r.missingGlyphs, 0, 'missing glyphs');
  eq(r.errors, [], 'errors');
  assert(r.text.includes('售价 $5 到 $10'), 'currency changed');
  eq(r.code, 's = "$x^2$"', 'code block');
  assert(r.fetches.length > 0 && r.fetches.every((u) => u.startsWith('https://cdn.jsdelivr.net/')), `fonts from jsDelivr: ${r.fetches}`);
  await page.screenshot({ path: path.join(outDir, 'userscript.png'), fullPage: true });
});

await test('font cache: a reload renders with no network', async () => {
  let page = await open();
  await settle(page);
  await page.close();
  page = await open({ clear: false });
  await settle(page);
  const r = await inspect(page);
  eq(r.fetches, [], 'font requests after reload');
  assert(r.alrTex.includes('\\ce{A <=> B}'), 'rendered from cache');
  eq(r.missingGlyphs, 0, 'missing glyphs');
});

await test('jsDelivr down -> GitHub raw fallback', async () => {
  fontMode = 'jsdelivr-down';
  const page = await open();
  await settle(page, 2500);
  const r = await inspect(page);
  assert(r.fetches.some((u) => u.startsWith('https://raw.githubusercontent.com/')), 'fell back to GitHub raw');
  eq(r.missingGlyphs, 0, 'missing glyphs');
  eq(r.errors, [], 'errors');
});

await test('tampered font data from jsDelivr is rejected (SHA-256) and replaced from GitHub raw', async () => {
  fontMode = 'tampered';
  const page = await open();
  await settle(page, 2500);
  const r = await inspect(page);
  assert(r.fetches.some((u) => u.startsWith('https://raw.githubusercontent.com/')), 'used the second source');
  const cachedOk = await page.evaluate(async () => {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('gm:font:'));
    for (const k of keys) {
      const text = JSON.parse(localStorage.getItem(k));
      const hash = k.split(':').pop();
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      if (hex !== hash) return false;
    }
    return keys.length > 0;
  });
  eq(cachedOk, true, 'only verified data is cached');
  eq(r.missingGlyphs, 0, 'missing glyphs');
});

await test('settings panel from the menu: mode switch, disable restores the page', async () => {
  const page = await open();
  await settle(page);
  const served = await page.evaluate(() => document.getElementById('thread').innerHTML);
  await page.evaluate(() => window.__menu['⚙ Advanced LaTeX 设置']());
  await page.waitForTimeout(500);
  const panel = await page.evaluate(() => {
    const host = document.querySelector('alr-panel-host');
    const sr = host?.shadowRoot;
    return { open: !!sr, status: sr?.querySelector('#engine-text')?.textContent, flavor: sr?.querySelector('#flavor')?.textContent };
  });
  assert(panel.open, 'panel opened');
  assert(/MathJax .* 已就绪/.test(panel.status), `panel status: ${panel.status}`);
  assert(panel.flavor.includes('油猴脚本'), `flavor: ${panel.flavor}`);
  await page.screenshot({ path: path.join(outDir, 'userscript-panel.png') });
  // switch to full mode in the panel
  await page.evaluate(() => {
    const r = document.querySelector('alr-panel-host').shadowRoot.querySelector('input[name=mode][value=full]');
    r.checked = true;
    r.dispatchEvent(new Event('change'));
  });
  await settle(page);
  const full = await page.evaluate(() => [...document.querySelectorAll('.katex')].filter((k) => k.getClientRects().length).length);
  eq(full, 0, 'no visible KaTeX in full mode');
  // disable via the menu toggle
  await page.evaluate(() => window.__menu['⏻ 启用 / 关闭 Advanced LaTeX']());
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => document.getElementById('thread').innerHTML);
  eq(after === served || after.replace(/\s+/g, '') === served.replace(/\s+/g, ''), false, 'sanity: served snapshot was taken after rendering');
  const restored = await page.evaluate(() => document.querySelectorAll('alr-math, alr-text, [data-alr-hidden], [data-alr-state]').length);
  eq(restored, 0, 'all extension changes removed when disabled');
});

await test('coexistence: if the extension already claimed the page, the userscript stays idle', async () => {
  const page = await open({ preset: () => document.documentElement.setAttribute('data-alr-runtime', 'extension') });
  await settle(page, 1500);
  const r = await inspect(page);
  eq(r.alrTex, [], 'userscript must not render');
  eq(r.runtime, 'extension', 'marker untouched');
});

await test('no requests except chatgpt.com and the two pinned font hosts', async () => {
  eq(external, [], 'unexpected hosts');
});

await ctx.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} userscript e2e tests passed`);
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
