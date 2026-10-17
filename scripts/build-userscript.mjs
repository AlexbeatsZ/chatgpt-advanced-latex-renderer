// Builds the userscript: dist-userscript/chatgpt-advanced-latex-renderer.user.js (+ .meta.js for
// update checks). The MathJax engine and base font are bundled; dynamic font ranges are JSON in
// userscript/fonts/ (regenerated here and verified against git so the tagged repo serves them).
import { build } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
const REPO = 'AlexbeatsZ/chatgpt-advanced-latex-renderer';
const NAME = 'chatgpt-advanced-latex-renderer';
const outDir = path.join(root, 'dist-userscript');
const latest = `https://github.com/${REPO}/releases/latest/download`;

if (pkg.version !== manifest.version) throw new Error(`package.json ${pkg.version} != manifest.json ${manifest.version}`);

execSync('node scripts/gen-userscript-fonts.mjs', { cwd: root, stdio: 'inherit' });

const header = `// ==UserScript==
// @name         ChatGPT Advanced LaTeX Renderer
// @name:zh-CN   ChatGPT 高级 LaTeX 渲染（MathJax 4 · mhchem · physics）
// @namespace    https://github.com/${REPO}
// @version      ${pkg.version}
// @description  Local MathJax 4 rendering for ChatGPT: mhchem (\\ce, \\pu), physics, AMS environments and custom macros. Font data is fetched on demand from jsDelivr/GitHub and verified with SHA-256.
// @description:zh-CN  用 MathJax 4 增强 ChatGPT 的 LaTeX 渲染：化学 \\ce、\\pu，physics 宏包，AMS 环境与自定义宏。字体数据按需从 jsDelivr/GitHub 下载并校验 SHA-256。
// @author       ${REPO.split('/')[0]}
// @license      MIT
// @homepageURL  https://github.com/${REPO}
// @supportURL   https://github.com/${REPO}/issues
// @downloadURL  ${latest}/${NAME}.user.js
// @updateURL    ${latest}/${NAME}.meta.js
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      cdn.jsdelivr.net
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @noframes
// ==/UserScript==
`;

await build({
  configFile: false,
  root,
  logLevel: 'warn',
  define: {
    __ALR_VERSION__: JSON.stringify(pkg.version),
    __ALR_REPO__: JSON.stringify(REPO),
  },
  build: {
    outDir,
    emptyOutDir: true,
    target: 'es2022',
    minify: false, // readable for review; userscript managers cache the parsed script
    lib: { entry: path.join(root, 'src/userscript/main.ts'), formats: ['iife'], name: 'ALRUserscript', fileName: () => `${NAME}.user.js` },
    rollupOptions: { output: { banner: header } },
  },
});

const file = path.join(outDir, `${NAME}.user.js`);
const code = fs.readFileSync(file, 'utf8');
if (!code.startsWith('// ==UserScript==')) throw new Error('header is not at the top of the userscript');
if (/\bnew Function\(|\beval\(/.test(code)) throw new Error('userscript contains eval/new Function');
if (/chrome\.(runtime|storage|tabs)/.test(code)) throw new Error('userscript references chrome.* extension APIs');
fs.writeFileSync(path.join(outDir, `${NAME}.meta.js`), header);
console.log(`built ${path.relative(root, file)} (${(code.length / 1024 / 1024).toFixed(2)} MiB)`);
