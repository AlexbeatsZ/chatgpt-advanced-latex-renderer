// Classic content script. Manifest V3 content scripts cannot be ES modules, so the real
// entry is imported dynamically; it runs in this isolated world and can lazy-load chunks.
(() => {
  import(chrome.runtime.getURL('content/main.js')).catch((e) => console.error('[ALR] failed to load', e));
})();
