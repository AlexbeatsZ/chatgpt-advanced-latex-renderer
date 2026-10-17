/** In-page host for the shared settings panel (Shadow DOM, so page CSS cannot leak in or out). */
import panelCss from '../popup/popup.css?raw';
import { mountPanel, type PanelApi } from '../ui/panel';

let host: HTMLElement | null = null;
let dispose: (() => void) | null = null;

// popup.css styles the popup page (:root / body); scope it to the shadow host instead.
const css =
  panelCss.replace(/:root/g, ':host').replace(/\bbody\s*\{/g, '.alr-panel {') +
  `
:host { all: initial; }
.alr-panel { position: fixed; top: 64px; right: 20px; z-index: 2147483646; max-height: calc(100vh - 96px); overflow: auto;
  border: 1px solid var(--line); border-radius: 12px; box-shadow: 0 12px 40px rgba(0,0,0,.25); }
.alr-close { position: absolute; top: 8px; right: 62px; border: none; background: none; font-size: 18px; line-height: 1; color: var(--muted); cursor: pointer; padding: 4px 6px; }
.alr-close:hover { color: var(--fg); }
`;

export function closePanel() {
  dispose?.();
  dispose = null;
  host?.remove();
  host = null;
}

export function openPanel(api: PanelApi) {
  if (host) return closePanel();
  host = document.createElement('alr-panel-host');
  host.setAttribute('data-alr-skip', '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = css;
  const box = document.createElement('div');
  box.className = 'alr-panel';
  const close = document.createElement('button');
  close.className = 'alr-close';
  close.type = 'button';
  close.title = '关闭';
  close.textContent = '×';
  close.addEventListener('click', closePanel);
  const content = document.createElement('div');
  box.append(close, content);
  shadow.append(style, box);
  document.body.appendChild(host);
  dispose = mountPanel(shadow, content, api);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closePanel();
      document.removeEventListener('keydown', onKey, true);
    }
  };
  document.addEventListener('keydown', onKey, true);
}
