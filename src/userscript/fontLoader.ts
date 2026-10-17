/**
 * Dynamic font ranges for the userscript: JSON data (see scripts/gen-userscript-fonts.mjs)
 * downloaded on demand, verified against SHA-256 hashes compiled into the script, cached,
 * then registered with MathJax. Nothing downloaded is ever executed.
 */
import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/mjs/svg.js';
import type { FontLoader } from '../render/engine';
import { FONT_HASHES } from './fontManifest';

export interface FontData {
  ext: string;
  file: string;
  variants: Record<string, unknown>;
  delimiters: Record<string, unknown>;
  fonts: unknown;
}

/** Environment hooks (Tampermonkey in the userscript, Node fs in tests). */
export interface FontSource {
  fetchText(url: string): Promise<string>;
  cacheGet(key: string): string | undefined;
  cacheSet(key: string, value: string): void;
  sha256(text: string): Promise<string>;
}

export const cacheKey = (name: string) => `font:${name}:${FONT_HASHES[name]}`;

export function applyFontData(d: FontData) {
  (MathJaxNewcmFont as any).dynamicSetup(d.ext, d.file, d.variants, d.delimiters, d.fonts ?? null);
}

/**
 * @param bases URL prefixes tried in order (each ends with "/"), e.g. jsDelivr then GitHub raw.
 */
export function makeJsonFontLoader(bases: string[], src: FontSource): FontLoader {
  return async (name: string) => {
    const hash = FONT_HASHES[name];
    if (!hash) throw new Error(`unknown font range "${name}"`);
    const key = cacheKey(name);
    let text = src.cacheGet(key);
    if (text !== undefined && (await src.sha256(text)) !== hash) text = undefined; // corrupted cache
    if (text === undefined) {
      const problems: string[] = [];
      for (const base of bases) {
        try {
          const t = await src.fetchText(`${base}${name}.json`);
          if ((await src.sha256(t)) === hash) {
            text = t;
            break;
          }
          problems.push(`${base}: SHA-256 mismatch (rejected)`);
        } catch (e) {
          problems.push(`${base}: ${(e as Error)?.message ?? e}`);
        }
      }
      if (text === undefined) throw new Error(`font range "${name}" unavailable - ${problems.join('; ')}`);
      src.cacheSet(key, text);
    }
    applyFontData(JSON.parse(text) as FontData);
  };
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
