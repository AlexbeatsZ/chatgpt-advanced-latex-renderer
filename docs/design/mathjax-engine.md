# MathJax 引擎与宏冲突设计

> 修改 `src/render/*`、`src/tex/preprocess.ts`、`src/tex/macros.ts` 或 `vite.config.ts` 前先读本文。

## 打包与加载（无 CDN）
- MathJax 4.1.3 以源码模块直接导入（`@mathjax/src/mjs/...`），不使用 MathJax 组件加载器。
- 输出：**SVG**，`fontCache: 'none'`。SVG 不需要 `@font-face`（避开页面 CSP 与字体 URL 问题）；
  `none` 让每个 SVG 自包含，可安全克隆（缓存命中时直接 `cloneNode`），没有共享 `<defs>` id。
- 三层按需加载（全部来自扩展本身，`web_accessible_resources` 仅对 ChatGPT 域名开放）：
  1. `content-loader.js`（经典脚本）→ `import(chrome.runtime.getURL('content/main.js'))`，约 26 KiB；
  2. 第一次有公式需要 MathJax 时 → `content/engine.js`（约 1.5 MB）；
  3. 字形落在动态区段时 → `content/fonts/<区段>.js`（`mathjax.asyncLoad` 映射，文件名白名单校验）。
- 引擎与字体是 Vite **独立入口**并以运行时 URL 导入；Vite 8 仍会给动态导入套预加载辅助函数，
  `scripts/check-dist.mjs` 断言所有调用的依赖数组为空（不会向页面插入 `<link>`）。
- mhchem 的箭头/键在 MathJax 4 中属于单独的字体扩展 `@mathjax/mathjax-mhchem-font-extension`，
  通过 `MathJaxNewcmFont.addExtension()` 注册。**缺少它时 `\ce{A <=> B}` 的箭头渲染为空 `<text>`**，
  单元测试用 “无空/私用区 `<text>`” 断言防回归。
- 不加载：`html`/`texhtml`（可注入原始 HTML/链接）、`noerrors`/`noundefined`（需要真实错误以便回退到页面原渲染）、`require`/`autoload`（运行时加载）。

## 错误与回退
`formatError` 记录消息；任何 TeX 错误 → `render()` 返回 `{ok:false}`，调用方保留页面原渲染并标记
`data-alr-state="error"`。每次转换前 `tex.reset()`，避免 `\label` 重复定义。`tags: 'none'`：不自动编号，`\tag{}` 仍有效。

## 宏包冲突策略（明确规则，不是简单覆盖）
| 冲突 | 默认行为 | 实现 |
|---|---|---|
| physics `\bra \ket \braket` vs braket 宏包 | physics 语义（`\bra{a}\ket{b}` 收缩为 ⟨a|b⟩，`\braket{a}{b}`） | braket 自带优先级 3 会压过 physics，因此以 `['braket', 10]` 加载；braket 的 `\set \Set \Bra \Ket \Braket` 仍可用 |
| braket 风格 `\braket{a|b}` / `\braket{a|H|b}` | 等价改写为 `\braket{a}{b}` / `\mel{a}{H}{b}` | `rewriteBraket`，只在单参数且含顶层 `|` 时触发；可关 |
| physics `\qty` vs siunitx `\qty{25}{kJ}` | 第一参数为数字且紧跟第二个 `{}` → siunitx 语义；其余（`\qty(…)`、`\qty{\frac ab}`）→ physics | `rewriteSiunitx`（还支持 `\SI \si \unit \num \ang` 子集）；可关 |
| physics 重定义标准命令：`\sin \cos \tan … \exp \log \ln \det \Pr` 带可选 `[n]` **幂次**参数与自动括号（真实对话中 `\ln[\ce{A}]` 被渲染成 ln^A）；`\div`（÷→∇·）、`\Re`、`\Im` | 保持标准 LaTeX 语义 | 自建 TeX 包 `alrstandard`（`src/render/standardFns.ts`，优先级 4：高于 physics 5、低于用户宏 3），重新注册 base 的 NamedFn/NamedOp/字符定义；设置“physics 覆盖标准命令”时不加载。physics 独有名（`\asin`、`\tr`、`\erf`、`\sine` 等）不受影响 |
| 用户宏与以上改写 | 用户定义的名字不被改写 | `preprocessTex({exclude})` |

验证：`tests/unit/engine.test.ts` 通过输出中竖线个数区分 physics 与 braket 语义（旧的“两者结果相等”断言曾在两者都错时误判通过）。

## 兼容模式触发条件
KaTeX 失败标记（`.katex-error`、`mathcolor=#cc0000`、HTML 红字）或源码使用“偏好命令”
（默认 `ce, pu, bra, ket, braket`，以及所有用户宏名）。`\bra/\ket` 在 KaTeX 中存在但是 braket 语义。
