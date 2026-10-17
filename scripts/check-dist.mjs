// Post-build sanity checks for dist/: required files exist, no remote URLs are loaded at
// runtime, no eval-like constructs, no modulepreload injection, and a size report.
import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const fail = (m) => {
  console.error('check-dist: ' + m);
  process.exitCode = 1;
};

for (const f of ['manifest.json', 'content-loader.js', 'content.css', 'content/main.js', 'popup.html', 'icons/128.png']) {
  if (!fs.existsSync(path.join(dist, f))) fail(`missing ${f}`);
}

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p) : files.push(p);
  }
})(dist);

let total = 0;
let mainSize = 0;
for (const f of files) {
  const size = fs.statSync(f).size;
  total += size;
  if (!f.endsWith('.js')) continue;
  const src = fs.readFileSync(f, 'utf8');
  if (f.endsWith(path.join('content', 'main.js'))) mainSize = size;
  // Dynamic imports must be relative (resolved against the extension URL).
  const remote = src.match(/import\(\s*["'`]https?:\/\/[^"'`]+/g);
  if (remote) fail(`${path.relative(dist, f)} imports remote code: ${remote[0]}`);
  // Vite always wraps dynamic imports in its preload helper. With an empty dependency array the
  // helper just calls import() and never touches the page DOM; fail if any call has dependencies.
  const helperCalls = (src.match(/\],import\.meta\.url\)/g) ?? []).length;
  const emptyCalls = (src.match(/\[\],import\.meta\.url\)/g) ?? []).length;
  if (helperCalls !== emptyCalls) fail(`${path.relative(dist, f)} preloads dependencies (would inject <link> into the page)`);
  if (/\bnew Function\(|\beval\(/.test(src)) fail(`${path.relative(dist, f)} uses eval/new Function`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
const kb = (n) => `${(n / 1024).toFixed(0)} KiB`;
console.log(`check-dist: ${files.length} files, ${kb(total)} total, content/main.js ${kb(mainSize)}`);
