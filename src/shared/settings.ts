import { DEFAULT_MACROS_TEXT } from '../tex/macros';

export type Mode = 'compat' | 'full';

export interface Settings {
  enabled: boolean;
  /** compat: only formulas the page failed on (or that use preferred commands); full: every recoverable formula. */
  mode: Mode;
  /** MathJax size relative to the surrounding text, percent. */
  scale: number;
  macrosText: string;
  /** Commands that make compat mode re-render a KaTeX formula even without visible errors. */
  preferCommands: string;
  /** Render LaTeX that the page left as plain text ($...$, \(...\), ...). */
  scanRawText: boolean;
  singleDollar: boolean;
  /** Also process the user's own messages (plain text bubbles). */
  userMessages: boolean;
  /** physics' \div (divergence), \Re, \Im override the standard LaTeX meanings. */
  physicsOverridesStandard: boolean;
  smartBraket: boolean;
  siunitx: boolean;
  /** Alt+click on a MathJax formula copies its LaTeX source. */
  altClickCopy: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: 'compat',
  scale: 100,
  macrosText: DEFAULT_MACROS_TEXT,
  // KaTeX lacks mhchem; \bra \ket \braket exist in KaTeX but with braket-package semantics.
  preferCommands: 'ce, pu, bra, ket, braket',
  scanRawText: true,
  singleDollar: true,
  userMessages: false,
  physicsOverridesStandard: false,
  smartBraket: true,
  siunitx: true,
  altClickCopy: true,
};

export const STORAGE_KEY = 'alrSettings';

export function normalizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (k in DEFAULT_SETTINGS && typeof v === typeof (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k]) s[k] = v;
    }
  }
  const out = s as unknown as Settings;
  if (out.mode !== 'compat' && out.mode !== 'full') out.mode = 'compat';
  out.scale = Math.min(250, Math.max(50, Math.round(out.scale)));
  return out;
}

export function parseCommandList(s: string): string[] {
  return s
    .split(/[\s,，;；]+/)
    .map((x) => x.trim().replace(/^\\/, ''))
    .filter((x) => /^[a-zA-Z]+$/.test(x));
}

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get(STORAGE_KEY);
  return normalizeSettings(got[STORAGE_KEY]);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}
