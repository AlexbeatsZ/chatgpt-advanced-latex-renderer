/**
 * Extension content-script module entry (imported by public/content-loader.js via dynamic import,
 * so it can lazily load the MathJax chunk and font chunks).
 * No network access, no telemetry: everything stays in the page and chrome.storage.local.
 */
import { Controller } from './controller';
import { claimPage } from './runtimeGuard';
import { extensionStore } from '../shared/settings';
import type { Request } from '../shared/messages';
import type * as BrowserEngine from '../render/browserEngine';

declare global {
  interface Window {
    __alrLoaded?: boolean;
  }
}

/** MathJax lives in its own entry (dist/content/engine.js), loaded only when first needed. */
async function loadEngine() {
  const m: typeof BrowserEngine = await import(/* @vite-ignore */ chrome.runtime.getURL('content/engine.js'));
  return m.createBrowserEngine;
}

async function main() {
  if (window.__alrLoaded) return;
  window.__alrLoaded = true;
  const claim = claimPage('extension');
  if (!claim.ok) {
    console.info(`[ALR] the ${claim.owner} version is already active on this page; the extension stays idle`);
    chrome.runtime.onMessage.addListener((msg: Request, _s, sendResponse) => {
      if (msg?.type === 'alr:status') sendResponse({ inactiveBecause: claim.owner });
      return false;
    });
    return;
  }

  const controller = new Controller(loadEngine);
  await controller.init(await extensionStore.load());
  extensionStore.onChange((s) => controller.applySettings(s));

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
