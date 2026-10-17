/**
 * Userscript entry (Tampermonkey / Violentmonkey). Same controller as the extension; differences:
 * - settings in userscript-manager storage (GM_getValue/GM_setValue);
 * - MathJax engine bundled in the script; dynamic font ranges fetched as verified JSON
 *   (jsDelivr, then GitHub raw, pinned to this version's tag) and cached locally;
 * - settings panel opened from the userscript manager's menu.
 * Talks to no server other than the two font hosts, and only for font data.
 */
import contentCss from '../../public/content.css?raw';
import { Controller } from '../content/controller';
import { claimPage } from '../content/runtimeGuard';
import { createDomEngine } from '../render/domEngine';
import { normalizeSettings, STORAGE_KEY, type Settings, type SettingsStore } from '../shared/settings';
import { makeJsonFontLoader, sha256Hex } from './fontLoader';
import { FONT_HASHES } from './fontManifest';
import { openPanel } from './panelHost';

const REF = `v${__ALR_VERSION__}`;
export const FONT_BASES = [
  `https://cdn.jsdelivr.net/gh/${__ALR_REPO__}@${REF}/userscript/fonts/`,
  `https://raw.githubusercontent.com/${__ALR_REPO__}/${REF}/userscript/fonts/`,
];

const listeners: ((s: Settings) => void)[] = [];
const gmStore: SettingsStore = {
  async load() {
    return normalizeSettings(GM_getValue(STORAGE_KEY));
  },
  async save(patch) {
    const next = normalizeSettings({ ...normalizeSettings(GM_getValue(STORAGE_KEY)), ...patch });
    GM_setValue(STORAGE_KEY, next);
    // Without a change listener API, apply locally right away.
    if (typeof GM_addValueChangeListener !== 'function') listeners.forEach((cb) => cb(next));
    return next;
  },
  onChange(cb) {
    listeners.push(cb);
    if (typeof GM_addValueChangeListener === 'function') GM_addValueChangeListener(STORAGE_KEY, (_k, _o, v) => cb(normalizeSettings(v)));
  },
};

function gmFetchText(url: string): Promise<string> {
  return new Promise((resolve, reject) =>
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      timeout: 20000,
      onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error(`HTTP ${r.status}`))),
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    }),
  );
}

/** Drop cached font ranges of other versions. */
function pruneFontCache() {
  try {
    const keep = new Set(Object.entries(FONT_HASHES).map(([n, h]) => `font:${n}:${h}`));
    for (const k of GM_listValues()) if (k.startsWith('font:') && !keep.has(k)) GM_deleteValue(k);
  } catch {
    /* GM_listValues not granted */
  }
}

function addStyle(css: string) {
  if (typeof GM_addStyle === 'function') GM_addStyle(css);
  else document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }));
}

async function main() {
  const claim = claimPage('userscript');
  if (!claim.ok) {
    console.info(`[ALR] the ${claim.owner} version is already active on this page; the userscript stays idle`);
    GM_registerMenuCommand('Advanced LaTeX：扩展版已在本页启用，脚本未运行', () => undefined);
    return;
  }
  addStyle(contentCss);
  pruneFontCache();
  const loadFont = makeJsonFontLoader(FONT_BASES, {
    fetchText: gmFetchText,
    cacheGet: (k) => GM_getValue<string | undefined>(k, undefined),
    cacheSet: (k, v) => GM_setValue(k, v),
    sha256: sha256Hex,
  });
  const controller = new Controller(async () => (cfg) => createDomEngine(cfg, loadFont));
  await controller.init(await gmStore.load());
  gmStore.onChange((s) => controller.applySettings(s));

  const panelApi = {
    load: () => gmStore.load(),
    save: (p: Partial<Settings>) => gmStore.save(p),
    status: async () => controller.status(),
    rerender: async () => controller.rerender(),
    validateMacros: async (text: string) => {
      const errors = await controller.validateMacros(text);
      return { ok: errors.length === 0, errors };
    },
    flavor: `油猴脚本 v${__ALR_VERSION__}`,
  };
  GM_registerMenuCommand('⚙ Advanced LaTeX 设置', () => openPanel(panelApi));
  GM_registerMenuCommand('⏻ 启用 / 关闭 Advanced LaTeX', async () => {
    const s = await gmStore.load();
    await gmStore.save({ enabled: !s.enabled });
  });
}

main().catch((e) => console.error('[ALR] userscript failed to start', e));
