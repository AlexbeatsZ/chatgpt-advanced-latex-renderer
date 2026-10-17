import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from '../shared/settings';
import { parseMacros } from '../tex/macros';
import type { Request, Status, ValidateResult } from '../shared/messages';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const BOOL_KEYS = ['scanRawText', 'singleDollar', 'userMessages', 'smartBraket', 'siunitx', 'physicsOverridesStandard', 'altClickCopy'] as const;

const MODE_HINT: Record<Settings['mode'], string> = {
  compat: '保留 ChatGPT 已正确渲染的公式，只把渲染失败（如 \\ce）或使用指定命令的公式交给 MathJax。',
  full: '所有能恢复 LaTeX 源码的公式统一用 MathJax 渲染。',
};

async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function send<T>(msg: Request): Promise<T | null> {
  const id = await activeTabId();
  if (id === undefined) return null;
  try {
    return (await chrome.tabs.sendMessage(id, msg)) as T;
  } catch {
    return null; // no content script in this tab (not ChatGPT, or the page predates installation)
  }
}

let settings: Settings = DEFAULT_SETTINGS;

async function update(patch: Partial<Settings>) {
  settings = await saveSettings(patch);
  render();
  setTimeout(refreshStatus, 400);
}

function render() {
  $<HTMLInputElement>('enabled').checked = settings.enabled;
  document.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) => (r.checked = r.value === settings.mode));
  $('mode-hint').textContent = MODE_HINT[settings.mode];
  $<HTMLInputElement>('scale').value = String(settings.scale);
  $('scale-out').textContent = `${settings.scale}%`;
  for (const k of BOOL_KEYS) $<HTMLInputElement>(k).checked = settings[k];
  if (document.activeElement !== $('macros')) $<HTMLTextAreaElement>('macros').value = settings.macrosText;
  if (document.activeElement !== $('prefer')) $<HTMLInputElement>('prefer').value = settings.preferCommands;
}

async function refreshStatus() {
  const st = await send<Status>({ type: 'alr:status' });
  const dot = $('engine-dot');
  const text = $('engine-text');
  const counts = $('counts');
  dot.className = 'dot';
  if (!st) {
    text.textContent = '当前标签页不是 ChatGPT，或页面需要刷新后才能连接扩展。';
    counts.innerHTML = '';
    $('errors-box').hidden = true;
    return;
  }
  const engineLabel: Record<Status['engine'], string> = {
    idle: '引擎未加载（尚无需要 MathJax 的公式）',
    loading: '正在加载 MathJax…',
    ready: `MathJax ${st.mathjaxVersion ?? ''} 已就绪`,
    error: `引擎加载失败：${st.engineError ?? ''}`,
  };
  dot.classList.add(st.engine);
  text.textContent = st.enabled ? engineLabel[st.engine] : '已关闭（页面保持原样）';
  if (st.mathjaxVersion) $('mj-version').textContent = st.mathjaxVersion;
  const rows: [string, number | string][] = [
    ['页面公式', st.counts.katexSeen],
    ['已升级', st.counts.upgraded],
    ['原文渲染', st.counts.rawRendered],
    ['无源码', st.counts.noSource],
    ['错误', st.counts.errors],
    ['扫描耗时', `${st.lastPassMs} ms`],
  ];
  counts.replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = String(v);
      return [dt, dd];
    }),
  );
  const box = $('errors-box');
  box.hidden = st.errors.length === 0;
  $('error-count').textContent = `(${st.errors.length})`;
  $('errors').replaceChildren(
    ...st.errors.map((e) => {
      const li = document.createElement('li');
      li.textContent = e.message;
      const code = document.createElement('code');
      code.textContent = e.tex;
      li.appendChild(code);
      return li;
    }),
  );
}

async function saveMacros() {
  const text = $<HTMLTextAreaElement>('macros').value;
  const msg = $('macro-msg');
  const parsed = parseMacros(text);
  if (parsed.errors.length) {
    msg.className = 'msg bad';
    msg.textContent = parsed.errors.join('\n');
    return;
  }
  msg.className = 'msg';
  msg.textContent = '检查中…';
  const res = await send<ValidateResult>({ type: 'alr:validate-macros', text });
  if (res && !res.ok) {
    msg.className = 'msg bad';
    msg.textContent = res.errors.join('\n');
    return;
  }
  await update({ macrosText: text, preferCommands: $<HTMLInputElement>('prefer').value });
  msg.className = 'msg ok';
  msg.textContent = res ? `已保存（${Object.keys(parsed.macros).length} 个宏）` : `已保存（${Object.keys(parsed.macros).length} 个宏，未在页面中验证）`;
}

async function init() {
  settings = await loadSettings();
  render();
  $<HTMLInputElement>('enabled').addEventListener('change', (e) => update({ enabled: (e.target as HTMLInputElement).checked }));
  document.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) =>
    r.addEventListener('change', () => update({ mode: r.value as Settings['mode'] })),
  );
  const scale = $<HTMLInputElement>('scale');
  scale.addEventListener('input', () => ($('scale-out').textContent = `${scale.value}%`));
  scale.addEventListener('change', () => update({ scale: Number(scale.value) }));
  for (const k of BOOL_KEYS) $<HTMLInputElement>(k).addEventListener('change', (e) => update({ [k]: (e.target as HTMLInputElement).checked }));
  $('save-macros').addEventListener('click', saveMacros);
  $<HTMLInputElement>('prefer').addEventListener('change', (e) => update({ preferCommands: (e.target as HTMLInputElement).value }));
  $('rerender').addEventListener('click', async () => {
    await send({ type: 'alr:rerender' });
    setTimeout(refreshStatus, 600);
  });
  await refreshStatus();
  setInterval(refreshStatus, 2000);
}

init();
