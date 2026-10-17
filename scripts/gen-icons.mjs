// Renders public/icons/*.png from an inline SVG with Playwright Chromium (run once; PNGs are committed).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect x="4" y="4" width="120" height="120" rx="26" fill="#0f766e"/>
  <path d="M34 34h52v12H52l22 18-22 18h36v12H34V84l24-20-24-20z" fill="#ffffff"/>
  <circle cx="96" cy="34" r="9" fill="#5eead4"/>
</svg>`;

const exe = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const page = await browser.newPage();
const out = path.resolve('public/icons');
fs.mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(out, `${size}.png`), omitBackground: true });
}
await browser.close();
console.log('icons written to', out);
