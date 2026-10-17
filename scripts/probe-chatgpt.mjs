// Real-page probe: opens chatgpt.com (logged out) in Playwright Chromium, sends a prompt,
// and dumps the assistant message DOM so extraction logic can be checked against reality.
// Usage: node scripts/probe-chatgpt.mjs [--ext] [--prompt-file file] [--out dir]
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

const outDir = path.resolve(opt('--out', path.join(os.tmpdir(), '.agents', 'chatgpt-probe')));
fs.mkdirSync(outDir, { recursive: true });
const promptText = flag('--prompt-file')
  ? fs.readFileSync(opt('--prompt-file'), 'utf8')
  : String.raw`Please reply with exactly these formulas, each as LaTeX math (do not use code blocks): inline \(E=mc^2\), display \[\int_0^1 x^2\,\mathrm{d}x\], $a+b$, $$\ce{2H2 + O2 -> 2H2O}$$ and \(\pdv{f}{x}\). Also add one fenced code block containing $x^2$.`;

const exe = process.env.CHROMIUM_PATH || findChromium();
const ext = path.join(root, 'dist');
const launchArgs = ['--lang=en-US'];
if (flag('--ext')) launchArgs.push(`--disable-extensions-except=${ext}`, `--load-extension=${ext}`);

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-chatgpt-'));
const ctx = await chromium.launchPersistentContext(userDir, {
  executablePath: exe,
  headless: false,
  args: launchArgs,
  viewport: { width: 1280, height: 900 },
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
page.on('console', (m) => {
  if (m.text().includes('[ALR]')) console.log('console:', m.text());
});
try {
  await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  const box = page.locator('#prompt-textarea, [contenteditable="true"]').first();
  await box.waitFor({ timeout: 60000 });
  await page.waitForTimeout(2000);
  // Dismiss possible login modal ("Stay logged out").
  const stay = page.getByText(/stay logged out/i).first();
  if (await stay.isVisible().catch(() => false)) await stay.click();
  await box.click();
  await page.keyboard.insertText(promptText);
  await page.keyboard.press('Enter');

  // Sample DOM during streaming.
  const samples = [];
  const t0 = Date.now();
  let lastLen = -1;
  let stable = 0;
  while (Date.now() - t0 < 120000) {
    await page.waitForTimeout(700);
    const html = await page
      .locator('[data-message-author-role="assistant"]')
      .last()
      .evaluate((e) => e.outerHTML)
      .catch(() => '');
    if (html && samples.length < 40) samples.push({ t: Date.now() - t0, html });
    const streaming = await page.locator('[data-testid="stop-button"]').count();
    if (html.length === lastLen && !streaming && html.length > 0) {
      if (++stable >= 4) break;
    } else stable = 0;
    lastLen = html.length;
  }
  const finalHtml = await page.locator('[data-message-author-role="assistant"]').last().evaluate((e) => e.outerHTML);
  const turnHtml = await page
    .locator('[data-message-author-role="assistant"]')
    .last()
    .evaluate((e) => (e.closest('article') ?? e.parentElement?.parentElement ?? e).outerHTML);
  fs.writeFileSync(path.join(outDir, 'final.html'), finalHtml);
  fs.writeFileSync(path.join(outDir, 'turn.html'), turnHtml);
  fs.writeFileSync(path.join(outDir, 'samples.json'), JSON.stringify(samples, null, 1));
  await page.screenshot({ path: path.join(outDir, 'screen.png'), fullPage: false });
  if (flag('--ext')) {
    const report = await page.evaluate(() => ({
      mjx: document.querySelectorAll('mjx-container').length,
      katex: document.querySelectorAll('.katex').length,
      alr: document.querySelectorAll('[data-alr-state]').length,
      errors: [...document.querySelectorAll('[data-alr-state="error"]')].map((e) => e.getAttribute('data-alr-error')),
    }));
    fs.writeFileSync(path.join(outDir, 'ext-report.json'), JSON.stringify(report, null, 1));
    console.log('ext report', report);
  }
  console.log('saved to', outDir);
  if (flag('--hold')) await page.waitForTimeout(Number(opt('--hold', '0')) || 600000);
} catch (e) {
  await page.screenshot({ path: path.join(outDir, 'error.png') }).catch(() => {});
  console.error('probe failed:', e.message);
  process.exitCode = 1;
} finally {
  await ctx.close();
  fs.rmSync(userDir, { recursive: true, force: true });
}

function findChromium() {
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
  const dirs = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort() : [];
  for (const d of dirs.reverse()) {
    const p = path.join(base, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}
