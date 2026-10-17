/**
 * Content-script module entry (imported by public/content-loader.js via dynamic import,
 * so it can lazily load the MathJax chunk and font chunks).
 * No network access, no telemetry: everything stays in the page and chrome.storage.local.
 */
import { Controller } from './controller';
import { loadSettings, normalizeSettings, STORAGE_KEY } from '../shared/settings';
import type { Request } from '../shared/messages';

declare global {
  interface Window {
    __alrLoaded?: boolean;
  }
}

async function main() {
  if (window.__alrLoaded) return;
  window.__alrLoaded = true;

  const controller = new Controller();
  await controller.init(await loadSettings());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[STORAGE_KEY]) controller.applySettings(normalizeSettings(changes[STORAGE_KEY].newValue));
  });

  chrome.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
    if (msg?.type === 'alr:status') {
      sendResponse(controller.status());
    } else if (msg?.type === 'alr:rerender') {
      controller.rerender();
      sendResponse({ ok: true });
    } else if (msg?.type === 'alr:validate-macros') {
      controller.validateMacros(msg.text).then(
        (errors) => sendResponse({ ok: errors.length === 0, errors }),
        (e) => sendResponse({ ok: false, errors: [String(e?.message ?? e)] }),
      );
      return true; // async response
    }
    return false;
  });
}

main().catch((e) => console.error('[ALR] failed to start', e));
