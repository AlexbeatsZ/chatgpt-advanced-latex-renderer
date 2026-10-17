// Extension popup: the shared panel talking to the active tab's content script.
import { extensionStore } from '../shared/settings';
import type { Request, ValidateResult } from '../shared/messages';
import { mountPanel, type PanelStatus } from '../ui/panel';

async function send<T>(msg: Request): Promise<T | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return null;
  try {
    return (await chrome.tabs.sendMessage(tab.id, msg)) as T;
  } catch {
    return null; // no content script in this tab (not ChatGPT, or the page predates installation)
  }
}

mountPanel(document, document.getElementById('app')!, {
  load: () => extensionStore.load(),
  save: (patch) => extensionStore.save(patch),
  status: () => send<PanelStatus>({ type: 'alr:status' }),
  rerender: async () => void (await send({ type: 'alr:rerender' })),
  validateMacros: (text) => send<ValidateResult>({ type: 'alr:validate-macros', text }),
  flavor: '扩展',
});
