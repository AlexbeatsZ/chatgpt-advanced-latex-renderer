// Userscript font path: JSON font ranges (userscript/fonts) + SHA-256 verification.
// Runs in its own test file so MathJax's font class starts with no ranges loaded.
import { describe, expect, it, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { liteAdaptor } from '@mathjax/src/mjs/adaptors/liteAdaptor.js';
import { TexEngine } from '../../src/render/engine';
import { makeJsonFontLoader, cacheKey, type FontSource } from '../../src/userscript/fontLoader';
import { FONT_HASHES } from '../../src/userscript/fontManifest';
import { preprocessTex } from '../../src/tex/preprocess';
import { CASES } from '../fixtures/formulas';
import { REAL_FORMULAS } from '../fixtures/real-chatgpt-formulas';

const fontDir = path.resolve(__dirname, '../../userscript/fonts');
const MIRROR = 'https://mirror.test/fonts/';
const DEAD = 'https://dead.test/fonts/';
const EVIL = 'https://evil.test/fonts/';

function makeSource() {
  const cache = new Map<string, string>();
  const fetched: string[] = [];
  const src: FontSource = {
    async fetchText(url) {
      fetched.push(url);
      if (url.startsWith(DEAD)) throw new Error('network error');
      const name = url.split('/').pop()!;
      const text = fs.readFileSync(path.join(fontDir, name), 'utf8');
      return url.startsWith(EVIL) ? text.replace('"p":"', '"p":"M0 0L999 999') : text;
    },
    cacheGet: (k) => cache.get(k),
    cacheSet: (k, v) => void cache.set(k, v),
    sha256: async (t) => crypto.createHash('sha256').update(t).digest('hex'),
  };
  return { src, cache, fetched };
}

const adaptor = liteAdaptor();
const M = { em: 16, ex: 8, containerWidth: 800 };
const MISSING_GLYPH = /<text[^>]*><\/text>|<text[^>]*>[-]/;
let engine: TexEngine<any>;
let main: ReturnType<typeof makeSource>;

beforeAll(() => {
  main = makeSource();
  // dead mirror first: every range must fall back to the second base
  engine = new TexEngine(adaptor, '', { macros: {}, physicsOverridesStandard: false }, makeJsonFontLoader([DEAD, MIRROR], main.src));
});

describe('JSON font ranges render like the bundled modules', () => {
  for (const c of [...CASES, ...REAL_FORMULAS.map((f) => ({ group: 'real', ...f }))]) {
    it(c.tex.slice(0, 70), async () => {
      const r = await engine.render(preprocessTex(c.tex), c.display, M);
      expect(r.ok ? 'ok' : r.error).toBe('ok');
      if (r.ok) expect(adaptor.outerHTML(r.node)).not.toMatch(MISSING_GLYPH);
    });
  }

  it('loaded ranges came from the fallback mirror and were cached under their hash', () => {
    const loaded = main.fetched.filter((u) => u.startsWith(MIRROR));
    expect(loaded.length).toBeGreaterThan(0);
    for (const u of loaded) {
      const name = u.split('/').pop()!.replace('.json', '');
      expect(main.cache.has(cacheKey(name))).toBe(true);
    }
  });
});

describe('integrity', () => {
  it('rejects a tampered range and falls back to a good mirror', async () => {
    const s = makeSource();
    const load = makeJsonFontLoader([EVIL, MIRROR], s.src);
    await load('arrows');
    expect(s.fetched).toEqual([`${EVIL}arrows.json`, `${MIRROR}arrows.json`]);
    expect((await s.src.sha256(s.cache.get(cacheKey('arrows'))!)) === FONT_HASHES.arrows).toBe(true);
  });

  it('fails clearly when every source is tampered or down', async () => {
    const s = makeSource();
    const load = makeJsonFontLoader([EVIL, DEAD], s.src);
    await expect(load('arrows')).rejects.toThrow(/SHA-256 mismatch.*network error/);
    expect(s.cache.size).toBe(0);
  });

  it('a corrupted cache entry is ignored and re-downloaded', async () => {
    const s = makeSource();
    s.cache.set(cacheKey('arrows'), '{"broken":true}');
    await makeJsonFontLoader([MIRROR], s.src)('arrows');
    expect(s.fetched).toEqual([`${MIRROR}arrows.json`]);
  });

  it('a valid cache entry means no network', async () => {
    const s = makeSource();
    s.cache.set(cacheKey('arrows'), fs.readFileSync(path.join(fontDir, 'arrows.json'), 'utf8'));
    await makeJsonFontLoader([DEAD], s.src)('arrows');
    expect(s.fetched).toEqual([]);
  });

  it('every committed JSON file matches the manifest', () => {
    for (const [name, hash] of Object.entries(FONT_HASHES)) {
      const text = fs.readFileSync(path.join(fontDir, `${name}.json`), 'utf8');
      expect(crypto.createHash('sha256').update(text).digest('hex'), name).toBe(hash);
    }
  });
});
