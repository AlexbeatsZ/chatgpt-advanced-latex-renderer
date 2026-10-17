# ChatGPT Advanced LaTeX Renderer

[![CI](https://github.com/AlexbeatsZ/chatgpt-advanced-latex-renderer/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexbeatsZ/chatgpt-advanced-latex-renderer/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/AlexbeatsZ/chatgpt-advanced-latex-renderer)](https://github.com/AlexbeatsZ/chatgpt-advanced-latex-renderer/releases)

Chrome / Edge（Manifest V3）扩展：在 chatgpt.com 上用**本地打包的 MathJax 4** 增强 LaTeX 渲染，重点支持
mhchem 化学式（`\ce`、`\pu`）、physics 宏包、AMS 环境和自定义宏。不修改 ChatGPT 生成的内容，不上传任何数据。

ChatGPT 自带的 KaTeX 不认识 `\ce` 等命令：要么把命令名显示成红字、其余内容乱排，要么在 ```latex 代码块
预览中显示“LaTeX 代码无效”，题目卡片里的公式则干脆不渲染。本扩展从页面里恢复原始 LaTeX，交给 MathJax 重新排版。

## 安装（开发者模式）

**直接下载**：在 [Releases](https://github.com/AlexbeatsZ/chatgpt-advanced-latex-renderer/releases) 下载
`chatgpt-advanced-latex-renderer-vX.Y.Z.zip`，解压后按下面第 2～4 步加载解压出的文件夹。

**从源码构建**：

1. 构建：
   ```bash
   pnpm install
   ```
   ```bash
   pnpm build
   ```
2. 打开 `chrome://extensions`（Edge：`edge://extensions`），开启“开发者模式”。
3. “加载已解压的扩展程序” → 选择本项目的 `dist` 文件夹。
4. 打开或刷新 chatgpt.com。

更新代码后重新 `pnpm build`，然后在扩展页点该扩展的“重新加载”并刷新 ChatGPT 页面（`manifest.json` 与
`content.css` 只在重新加载扩展时更新）。最低版本 Chrome / Edge 120。

## 油猴脚本版本

适合不方便安装扩展的场景（功能与扩展相同，同一套代码）：

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 或 Violentmonkey。Chrome 138+ 的 Tampermonkey 需要在其扩展详情页打开“允许用户脚本”。
2. 打开 [chatgpt-advanced-latex-renderer.user.js](https://github.com/AlexbeatsZ/chatgpt-advanced-latex-renderer/releases/latest/download/chatgpt-advanced-latex-renderer.user.js) 并点“安装”。之后会自动检查更新。
3. 设置：在 ChatGPT 页面点油猴图标 → “⚙ Advanced LaTeX 设置”（页内面板，和扩展弹出界面相同）。

与扩展的区别：脚本（约 1.9 MB，未压缩、可审阅）内置 MathJax 和基础字体；遇到基础字体之外的字形（如
`\mathfrak`、`\mathscr`、西里尔字母）时，按需从 jsDelivr（失败则 GitHub raw）下载对应字形区段的**纯数据 JSON**，
用脚本内置的 SHA-256 校验后才使用并缓存到本地，下载的内容不会被执行。扩展和脚本同时装上时只有先启动的一个生效。
设计说明见 [docs/design/userscript.md](docs/design/userscript.md)。

## 功能

| 功能 | 说明 |
|---|---|
| 兼容增强模式（默认） | 保留 ChatGPT 已正确渲染的公式；只把 KaTeX 失败的（红字、解析错误）或使用指定命令（默认 `\ce \pu \bra \ket \braket` 与所有自定义宏）的公式换成 MathJax |
| 完整 MathJax 模式 | 所有能恢复源码的公式统一用 MathJax，保持行内/块级语义 |
| 关闭 | 删除扩展添加的全部节点与属性，页面恢复原样（测试验证与原始 DOM 完全一致） |
| 原文公式 | 渲染页面没渲染的 `$…$`、`\(…\)`、`\[…\]`、`$$…$$`、裸 `\begin{align}…`（ChatGPT 不渲染单美元公式；题目卡片中的公式也是原文） |
| ```latex 代码块 | 预览失败（“LaTeX 代码无效”）时，从代码块源码恢复，按空行逐个渲染；“显示源代码”不受影响 |
| 动态页面 | MutationObserver 批处理（150 ms 防抖、最长 700 ms），流式输出中完整的公式逐步出现，未闭合的保持原样 |
| 懒渲染 | 只渲染滚动容器视口上下约 1200 px 内的公式，长对话不卡顿 |
| 复制 | 选中文字复制时公式以 `$…$` 形式出现；Alt+单击公式复制 LaTeX 源码（MathJax 与原生 KaTeX 均可） |
| 弹出界面 | 开关、模式、重新渲染、引擎状态与错误列表、字号、自定义宏（保存时校验）、高级选项 |

## 支持的命令（MathJax 已实现的部分）

- **基础/AMS**：`align(*)`、`aligned`、`gather`、`multline`、`split`、`cases`、`matrix/pmatrix/bmatrix/vmatrix/Vmatrix`、`\substack`、`\boxed`、`\tag`、`\label`、`\text`、`\operatorname`、`\boldsymbol`、`\mathbf`、`\newcommand`、`\DeclareMathOperator`、`\def`
- **化学 mhchem**：`\ce{H2O}`、`\ce{2H2 + O2 -> 2H2O}`、`\ce{Fe^3+ + e- -> Fe^2+}`、`\ce{A <=> B}`、`\ce{M.}`、`\ce{M^{+.}}`、`\ce{CO2 + C ->[\alpha][\beta] 2CO}`、沉淀/气体符号、同位素、`\pu{25 kJ mol-1}`
- **physics**：`\dv`、`\pdv`、`\dd`、`\qty`、`\pqty`…、`\vb`、`\vu`、`\va`、`\bra`、`\ket`、`\braket`、`\ketbra`、`\expval`、`\mel`、`\abs`、`\norm`、`\comm`、`\acomm`、`\grad`、`\curl`、`\divergence`、`\laplacian`、`\mqty` 等
- **其他扩展**：mathtools、empheq、cancel、braket（`\set`、`\Bra`…）、cases、centernot、color、colortbl、bbox、enclose、extpfeil、gensymb、textcomp、textmacros（`\text` 内的重音等）、unicode、units、upgreek、bbm、dsfont、verb、begingroup、amscd
- **siunitx 子集**（扩展自带的预处理）：`\qty{25}{kJ.mol^-1}`、`\SI{298.15}{\kelvin}`、`\si{\joule\per\mole\per\kelvin}`、`\unit`、`\num`、`\ang`

### 宏包冲突的处理规则

| 冲突 | 默认 |
|---|---|
| physics 与 braket 都定义 `\bra \ket \braket` | physics 语义；`\braket{a|b}` 这种 braket 写法自动改写为等价的 `\braket{a}{b}`，`\braket{a|H|b}` → `\mel{a}{H}{b}` |
| physics `\qty` 与 siunitx `\qty{数}{单位}` | 第一参数是数字且紧跟第二个参数 → 按 siunitx；其余按 physics |
| physics 改写标准命令 `\div`（÷ → ∇·）、`\Re`、`\Im` | 保持标准 LaTeX 含义（可在高级选项中改为 physics 含义） |
| 你的自定义宏与以上规则 | 你定义的名字优先，不被任何改写触碰 |

## 自定义宏

弹出界面 →“自定义宏”，用普通 LaTeX 语法，每行一个：

```latex
\newcommand{\vect}[1]{\boldsymbol{#1}}   % 向量：粗体
\newcommand{\mat}[1]{\mathbf{#1}}        % 矩阵
\newcommand{\diff}{\mathrm{d}}           % 微分 d
\newcommand{\ee}{\mathrm{e}}             % 自然常数
\newcommand{\ii}{\mathrm{i}}             % 虚数单位
\DeclareMathOperator{\Tr}{Tr}
```

以上是默认内容：**只新增命令名，不改变任何标准命令**。支持 `\newcommand`/`\renewcommand`/`\providecommand`
（含 `[n]`、`[默认值]`）、`\DeclareMathOperator(*)`、`\def\name#1{…}`。保存时会在页面中编译检查。
自定义宏名自动加入“兼容模式下强制用 MathJax 的命令”（KaTeX 不认识它们）。

## 隐私与权限

只申请 `storage`；内容脚本只匹配 `https://chatgpt.com/*`、`https://chat.openai.com/*`。无网络请求、无遥测、
无远程代码（e2e 测试拦截所有非 chatgpt.com 请求并断言为零）。详见 [PRIVACY.md](PRIVACY.md)。

## 架构

```
public/content-loader.js   经典内容脚本，动态 import 主模块
src/content/main.ts        入口：设置、消息
src/content/controller.ts  调度：扫描 → 懒渲染队列 → 应用/恢复，状态统计
src/content/observer.ts    MutationObserver 批处理 + 自身变更过滤（防循环）
src/content/lazy.ts        以真实滚动容器为根的 IntersectionObserver
src/dom/katex.ts           已渲染公式定位、源码恢复、失败检测、代码块预览
src/dom/rawText.ts         原文公式：文本收集、原位替换与精确还原
src/dom/scope.ts           消息范围与排除区域（不依赖哈希类名）
src/tex/*.ts               定界符扫描、宏解析、冲突预处理、代码块切分（纯函数）
src/render/engine.ts       MathJax 4（TeX → SVG），浏览器/Node 通用
src/ui/panel.ts            设置/状态面板（扩展弹出页与脚本页内面板共用）
src/popup/*                扩展弹出页（面板 + chrome.tabs 消息）
src/userscript/*           油猴脚本入口、GM 存储、字形 JSON 加载与校验
```

设计细节与真实页面观察记录：[docs/design/chatgpt-dom.md](docs/design/chatgpt-dom.md)、[docs/design/mathjax-engine.md](docs/design/mathjax-engine.md)。

**DOM 安全原则**：不删除、不移动、不拆分页面（React）节点。KaTeX 公式只加隐藏属性并在旁边插入自己的节点；
原文公式只改文本节点的内容并记录原值，React 之后改写时检测到差异就先还原再重做。所以代码复制、文本选择、
消息编辑、表格、题目单选等页面交互保持原样。

## 测试

```bash
pnpm test
```
```bash
pnpm build && pnpm test:e2e
```
```bash
pnpm build:userscript && pnpm test:userscript
```

- 单元测试（Vitest，230 个）：定界符/货币/转义/嵌套括号/未闭合；宏解析；冲突改写；真实 MathJax 编译全部
  夹具公式（含 20 条取自真实对话的公式），并断言无缺字形；jsdom 上的提取、原位替换与还原、代码块预览；
  油猴脚本的字形 JSON 路径（全部公式重新渲染、篡改拒绝、镜像回退、缓存）。
- 油猴脚本端到端（7 个）：真实 Chromium 中注入构建出的 `.user.js`（GM_* 垫片代替 Tampermonkey），字体主机请求被拦截：
  渲染结果、缓存后离线、jsDelivr 故障回退、篡改数据被拒绝、页内面板与开关、与扩展共存、无多余请求。
- 端到端（Playwright + 真实 Chromium + 构建产物，15 个）：在 `https://chatgpt.com/` 域名下用**模拟页面**
  （按真实结构复刻，KaTeX 由真实 KaTeX 生成）测试注入、两种模式、关闭恢复、刷新后状态、深色模式、
  基线与字号、流式、React 式重渲染、题目单选交互、选择复制、Alt+单击、长对话性能、内部滚动容器预渲染、无外部请求。

CI（GitHub Actions，Ubuntu）在每次推送到 `main` 时运行类型检查、单元测试、构建、扩展与脚本的端到端测试，
并确认提交的字形 JSON 与重新生成的一致，上传未打包扩展、脚本与截图。发布：把 `public/manifest.json` 与
`package.json` 的版本改为同一值，提交后推送标签 `vX.Y.Z`，Release 工作流会校验版本、重跑全部测试，
上传扩展 zip、`.user.js`、`.meta.js`（附 SHA-256）并创建 GitHub Release。脚本的字形 URL 固定到该标签。

## 验证状态

| 项目 | 状态 |
|---|---|
| 提取层在真实 chatgpt.com（Windows Chrome，2026-10-17） | ✅ 只读探针：159/159 公式恢复源码，85 个 `\ce` 失败全部识别，题目卡片 9 个原文公式全部找到 |
| 真实页面渲染（已加载扩展的 Chrome） | ✅ 历史对话：屏幕内及下方 900 px 内无待渲染公式、0 错误、0 缺字形；✅ 一次真实流式回答：```latex 预览失败被替换为 5 行公式，10 个 KaTeX 中需要的 7 个升级、无可见红字，`$E=h\nu$` 渲染，货币与 Python 代码不变，无页面 JS 错误 |
| 代码块多行公式“每行一个”的最终外观 | ⚠️ 修复（内联样式）后只在模拟页验证；真实页需重新加载扩展后再看一次 |
| Edge | ⚠️ 未实测（同为 Chromium MV3，预期可用） |
| macOS（Apple Silicon，Chrome，2026-10-17） | ✅ v0.2.0 类型检查、230 单元测试、扩展与脚本构建通过；Chrome 配置已有本项目扩展登记；⚠️ 新版本重新加载及真实页面运行尚未验收 |
| 油猴脚本在真实 Tampermonkey + 真实 chatgpt.com | ⚠️ 未验证（逻辑与扩展共用，已在 GM 垫片 + 模拟页上测试） |
| 消息编辑、分支切换、分享页、移动端 | ⚠️ 未在真实页面专门测试（逻辑上不触碰页面节点） |
| 浅色模式真实页面 | ⚠️ 只在模拟页验证（SVG 使用 currentColor） |

## 已知限制与与完整 LaTeX 的差异

- 只能处理 MathJax 实现的 LaTeX 子集：没有真正的宏包加载、`\usepackage`、TikZ/pgfplots、chemfig、
  `\documentclass` 文档（这类代码块保持原样）；siunitx 只有上面列出的子集。
- 公式彼此独立排版：跨公式的 `\ref`/`\eqref` 与自动编号不可用；`\tag{}` 可用。
- 源码已被 Markdown 破坏的情况无法恢复（例如 `$a_1 * b_2$` 中的下划线被当成斜体）。
- 源码在 DOM 中不存在时（极少数）保留原渲染，绝不从视觉字符反推。
- 原文中 `\(...\)` 这类只有省略号的“讲解语法”文字故意不渲染；单美元采用 pandoc 规则排除货币。
- 首次需要 MathJax 时要加载约 1.5 MB 引擎（本地，约 100 ms 级主线程占用）。
- 扩展声明了可访问资源，网站可以探测到扩展存在（不含个人数据）。
- 依赖 ChatGPT 的 DOM 语义属性（`data-content-search-unit-key`、`data-code-block` 等，已有多重回退）；
  ChatGPT 改版后可能需要更新 `src/dom/scope.ts` 和 `katex.ts`。`scripts/probe-chatgpt.mjs` 与
  `tests/real/` 用于重新研究页面。

## 许可证

MIT（见 [LICENSE](LICENSE)）。打包的 MathJax 及字体为 Apache-2.0，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
