// Real chatgpt.com formulas must compile (and not hang) in the engine.
import { describe, expect, it } from 'vitest';
import { liteAdaptor } from '@mathjax/src/mjs/adaptors/liteAdaptor.js';
import { TexEngine } from '../../src/render/engine';
import { fontLoaders } from '../../src/render/fontLoaders';
import { REAL_FORMULAS } from '../fixtures/real-chatgpt-formulas';

const adaptor = liteAdaptor();
const engine = new TexEngine<any>(adaptor, '', { macros: {}, physicsOverridesStandard: false }, (n) => fontLoaders[n]());

describe('real ChatGPT formulas', () => {
  for (const f of REAL_FORMULAS) {
    it(f.tex.slice(0, 60), async () => {
      const r = await engine.render(f.tex, f.display, { em: 16, ex: 8, containerWidth: 700 });
      expect(r.ok ? 'ok' : r.error).toBe('ok');
    }, 5000);
  }
});
