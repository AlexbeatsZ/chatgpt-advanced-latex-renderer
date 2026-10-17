# ChatGPT 页面 DOM 适配设计

> 修改 `src/dom/*`、`src/content/*` 前必须先读本文。观察结论均来自真实页面（见“观察记录”），不是假设。

## 观察记录（2026-10-17，Windows Chrome，已登录账号，中文界面）

观察方式：Claude in Chrome 打开真实 chatgpt.com（临时聊天 + 一个已有的化学动力学历史对话），用页面脚本统计 DOM。

1. **不存在** `data-message-author-role`（参考项目普遍依赖它）。消息单元是
   `div[data-content-search-unit-key="fallback-turn-N:M:assistant|user"]`，同一元素还带
   `data-chatgpt-search-unit-key`。助手消息里另有 `h4[data-conversation-role="assistant"]`（sr-only）。
2. 类名是带哈希的 CSS Modules 名，如 `Paragraph-kKnbIo`、`Math-C48SKy`、`DilRenderer-tB76Jj`，**不可依赖**。
   语义属性较稳定：`data-d-component="text|math|code|title"`、`data-d-block`、`data-markdown-text-style="assistant-message"`。
3. 公式由 KaTeX 渲染：
   - 行内：`span[data-d-component=math][data-d-stream-inline] > span.katex`
   - 块级：`div[data-d-component=math][data-d-block] > span.katex-display > span.katex`
   - 每个 `.katex` 内都有 `annotation[encoding="application/x-tex"]`，即原始 TeX（159/159 均有）。
4. KaTeX 不认识的命令**不会**生成 `.katex-error`，而是把命令名渲染成红字并继续排版剩余部分：
   - MathML 侧：`mstyle[mathcolor="#cc0000"]`，文本为 `\ce`
   - HTML 侧：`span.mord[style="color: rgb(204, 0, 0)"]`
   历史对话中 `\ce` 85/85 全部失败，其余命令（`\frac`、`\boxed`、`\mathrm` 等）正常。
5. 流式输出：每 ~100ms 采样一次，**从未出现原始 LaTeX 文本**；公式完整后才一次性以 KaTeX 出现，
   普通文字被拆成逐词的 `span[data-d-stream-word]`（连 `\` 与 `(` 都可能在不同 span 中）。
   完成后的历史消息没有逐词 span。
6. 代码块是 CodeMirror：`div.cm-editor > div.cm-content[contenteditable=true][data-language]`，没有 `<pre>`。
   行内代码仍是 `<code>`。
7. 单美元 `$a+b=c$` 原生**不渲染**，保持为文本；`$5 到 $10` 作为文本保留。
8. 模型有时会故意输出字面量 `\(...\)`、`$$...$$`（在解释语法时），它们在 DOM 中作为普通文本存在。
9. 页面响应头中未见 CSP。

## 设计决策

### 源码恢复优先级（`src/dom/katex.ts`）
1. `annotation[encoding="application/x-tex"|"application/x-latex"]`
2. `script[type^="math/tex"]`
3. 自身或最近 2 层祖先上的 `data-latex` / `data-tex` / `data-math`（MathJax 4 的 `data-latex` 也走这里）
4. 都没有 → 返回 `null`，**保留原渲染，不从可视字符反推**。

### 失败检测（兼容增强模式）
命中任一即交给 MathJax：`.katex-error`；`[mathcolor="#cc0000"]`（任意大小写）；HTML 侧 `color: rgb(204, 0, 0)`；
源码中出现“偏好 MathJax 的命令”（默认 `\ce`、`\pu` + 用户自定义宏名）。

### DOM 修改原则（React 安全）
- **绝不删除、移动或拆分页面自有节点**（Google 翻译类问题会让 React 在 `removeChild` 时崩溃）。
- KaTeX 升级：给原 `.katex`/`.katex-display` 加 `data-alr-hidden`（CSS 隐藏），在其后插入我们自己的
  `<alr-math>` 兄弟节点。React 重置该处 innerHTML 时两者一起消失，观察器会重新处理（有缓存）。
- 原文公式（`$...$` 等）：整块“隐藏原块 + 插入克隆块”。克隆块是我们拥有的节点，可以随意拆分文本；
  原块文本变化（流式/重渲染）时删除克隆并重建。
- 关闭/切换模式：删除所有 `alr-*` 节点、移除 `data-alr-*` 属性即可完全恢复。

### 排除区域
`pre, code, kbd, samp, textarea, input, script, style, .cm-editor, [contenteditable], .katex, mjx-container, alr-math, alr-block`
这些节点在原文扫描中被视为“断点”（插入 `￼`），公式不能跨越它们。

### 防循环
所有 DOM 写操作都在 `observer.mutate(fn)` 中进行：写之前先 `takeRecords()` 并入队（保留页面变化），
写完再 `takeRecords()` 丢弃（只丢自己的变化）。另外忽略只涉及 `alr-*` 节点或 `data-alr-*` 属性的记录。

### 原文扫描的保守规则（`src/tex/delimiters.ts`）
- 主体为空或仅 `...`/`…`/空白时不渲染（避免把“使用 \(...\)”这种讲解文字渲染掉）。
- 单美元遵循 pandoc 规则：开 `$` 右侧非空白，闭 `$` 左侧非空白且其后不是数字；不跨行；`\$` 为字面量。
- 括号深度：闭定界符必须位于未转义大括号深度 0；不闭合 = 未完成（流式中），保持原样等待下次。
