/**
 * Settings / status panel shared by the extension popup and the userscript's in-page panel.
 * All page access goes through PanelApi, so the same UI works with chrome.tabs messaging
 * (extension) or direct calls into the controller (userscript).
 */
import type { Settings } from '../shared/settings';
import { parseMacros } from '../tex/macros';
import type { Status, ValidateResult } from '../shared/messages';

export type PanelStatus = Status | { inactiveBecause: string } | null;

export interface PanelApi {
  load(): Promise<Settings>;
  save(patch: Partial<Settings>): Promise<Settings>;
  /** null: no controller reachable (extension popup on a non-ChatGPT tab). */
  status(): Promise<PanelStatus>;
  rerender(): Promise<void>;
  /** null: could not validate in the page. */
  validateMacros(text: string): Promise<ValidateResult | null>;
  /** e.g. "扩展" / "油猴脚本" for the footer */
  flavor: string;
}

export const PANEL_HTML = `
<header>
  <h1>Advanced LaTeX</h1>
  <label class="switch" title="启用 / 关闭（关闭后恢复原网页显示）"><input type="checkbox" id="enabled" /><span></span></label>
</header>
<section class="row">
  <div class="seg" role="radiogroup" aria-label="渲染模式">
    <label><input type="radio" name="mode" value="compat" /><span>兼容增强</span></label>
    <label><input type="radio" name="mode" value="full" /><span>完整 MathJax</span></label>
  </div>
  <button id="rerender" type="button" title="清除并重新渲染当前页面">重新渲染</button>
</section>
<p class="hint" id="mode-hint"></p>
<section class="status" id="status">
  <div class="status-line"><span class="dot" id="engine-dot"></span><span id="engine-text">正在连接页面…</span></div>
  <dl class="counts" id="counts"></dl>
  <details id="errors-box" hidden><summary>渲染错误 <span id="error-count"></span></summary><ul id="errors"></ul></details>
</section>
<section class="row">
  <label for="scale">公式大小</label>
  <input type="range" id="scale" min="70" max="200" step="5" />
  <output id="scale-out"></output>
</section>
<details class="block">
  <summary>自定义宏</summary>
  <textarea id="macros" spellcheck="false" rows="8"></textarea>
  <div class="row"><button id="save-macros" type="button">保存并检查</button><span id="macro-msg" class="msg"></span></div>
  <label class="field">兼容模式下强制用 MathJax 的命令<input id="prefer" type="text" placeholder="ce, pu" spellcheck="false" /></label>
</details>
<details class="block">
  <summary>高级选项</summary>
  <label class="check"><input type="checkbox" id="scanRawText" /> 渲染页面未渲染的原始 LaTeX 文本</label>
  <label class="check"><input type="checkbox" id="singleDollar" /> 识别单美元 <code>$…$</code>（货币金额自动排除）</label>
  <label class="check"><input type="checkbox" id="userMessages" /> 同时处理我发送的消息</label>
  <label class="check"><input type="checkbox" id="smartBraket" /> <code>\\braket{a|b}</code> 按 braket 宏包语义处理</label>
  <label class="check"><input type="checkbox" id="siunitx" /> siunitx 子集（<code>\\qty{25}{kJ.mol^-1}</code>、<code>\\SI</code>、<code>\\si</code>）</label>
  <label class="check"><input type="checkbox" id="physicsOverridesStandard" /> physics 覆盖标准命令（<code>\\ln[n]</code>=幂次，<code>\\div</code>=散度，<code>\\Re</code>/<code>\\Im</code>=算符）</label>
  <label class="check"><input type="checkbox" id="altClickCopy" /> Alt+单击公式复制 LaTeX 源码</label>
</details>
<footer>本地渲染 · 不上传任何聊天内容 · <span id="flavor"></span> · MathJax <span id="mj-version">4</span></footer>
`;

const BOOL_KEYS = ['scanRawText', 'singleDollar', 'userMessages', 'smartBraket', 'siunitx', 'physicsOverridesStandard', 'altClickCopy'] as const;

const MODE_HINT: Record<Settings['mode'], string> = {
  compat: '保留 ChatGPT 已正确渲染的公式，只把渲染失败（如 \\ce）或使用指定命令的公式交给 MathJax。',
  full: '所有能恢复 LaTeX 源码的公式统一用 MathJax 渲染。',
};

/** Renders the panel into `container` (inside `root`). Returns a function that stops polling. */
export function mountPanel(root: Document | ShadowRoot, container: Element, api: PanelApi): () => void {
  container.innerHTML = PANEL_HTML;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector(`#${id}`) as T;
  let settings: Settings;

  const render = () => {
    $<HTMLInputElement>('enabled').checked = settings.enabled;
    root.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) => (r.checked = r.value === settings.mode));
    $('mode-hint').textContent = MODE_HINT[settings.mode];
    $<HTMLInputElement>('scale').value = String(settings.scale);
    $('scale-out').textContent = `${settings.scale}%`;
    for (const k of BOOL_KEYS) $<HTMLInputElement>(k).checked = settings[k];
    if (root.activeElement !== $('macros')) $<HTMLTextAreaElement>('macros').value = settings.macrosText;
    if (root.activeElement !== $('prefer')) $<HTMLInputElement>('prefer').value = settings.preferCommands;
  };

  const update = async (patch: Partial<Settings>) => {
    settings = await api.save(patch);
    render();
    setTimeout(refreshStatus, 400);
  };

  const refreshStatus = async () => {
    const st = await api.status();
    const dot = $('engine-dot');
    const text = $('engine-text');
    const counts = $('counts');
    dot.className = 'dot';
    if (!st || 'inactiveBecause' in st) {
      text.textContent = !st
        ? '当前标签页不是 ChatGPT，或页面需要刷新后才能连接。'
        : `本页已由${st.inactiveBecause === 'extension' ? '扩展' : '油猴脚本'}版本处理，此版本未启用。`;
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
    $('errors-box').hidden = st.errors.length === 0;
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
  };

  const saveMacros = async () => {
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
    const res = await api.validateMacros(text);
    if (res && !res.ok) {
      msg.className = 'msg bad';
      msg.textContent = res.errors.join('\n');
      return;
    }
    await update({ macrosText: text, preferCommands: $<HTMLInputElement>('prefer').value });
    const n = Object.keys(parsed.macros).length;
    msg.className = 'msg ok';
    msg.textContent = res ? `已保存（${n} 个宏）` : `已保存（${n} 个宏，未在页面中验证）`;
  };

  let timer: ReturnType<typeof setInterval> | undefined;
  (async () => {
    settings = await api.load();
    $('flavor').textContent = api.flavor;
    render();
    $<HTMLInputElement>('enabled').addEventListener('change', (e) => update({ enabled: (e.target as HTMLInputElement).checked }));
    root.querySelectorAll<HTMLInputElement>('input[name=mode]').forEach((r) =>
      r.addEventListener('change', () => update({ mode: r.value as Settings['mode'] })),
    );
    const scale = $<HTMLInputElement>('scale');
    scale.addEventListener('input', () => ($('scale-out').textContent = `${scale.value}%`));
    scale.addEventListener('change', () => update({ scale: Number(scale.value) }));
    for (const k of BOOL_KEYS) $<HTMLInputElement>(k).addEventListener('change', (e) => update({ [k]: (e.target as HTMLInputElement).checked }));
    $('save-macros').addEventListener('click', saveMacros);
    $<HTMLInputElement>('prefer').addEventListener('change', (e) => update({ preferCommands: (e.target as HTMLInputElement).value }));
    $('rerender').addEventListener('click', async () => {
      await api.rerender();
      setTimeout(refreshStatus, 600);
    });
    await refreshStatus();
    timer = setInterval(refreshStatus, 2000);
  })();
  return () => clearInterval(timer);
}
