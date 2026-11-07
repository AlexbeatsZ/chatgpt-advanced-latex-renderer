# AGENTS.md

## Goal
Chrome/Edge MV3 扩展，为 ChatGPT 及 Claude、Gemini、AI Studio、DeepSeek、Grok、Kimi、豆包、千问、元宝、智谱等 AI 对话网站
提供本地 MathJax 4 增强 LaTeX 渲染（mhchem、physics、AMS、自定义宏），另提供共用渲染逻辑的 Tampermonkey / Violentmonkey 脚本（2026-11 用户要求扩展到多站点）。不改 ChatGPT 原始内容、不上传数据。需求原文要点：兼容增强（默认）/完整 MathJax/关闭三态；从 DOM 恢复原始
TeX（annotation 优先，绝不反推）；流式、长对话、内部导航兼容；不破坏代码复制/选择/编辑/表格；构建时打包、无 CDN；
弹出界面含开关、模式、重新渲染、状态与错误、字号、自定义宏。

## Current State
- 版本 0.3.0（多站点，2026-11-07 已发布 https://github.com/AlexbeatsZ/chatgpt-advanced-latex-renderer/releases/tag/v0.3.0 ，CI/Release 通过），分支 main，远端公开仓库 https://github.com/AlexbeatsZ/chatgpt-advanced-latex-renderer 。
  CI（`.github/workflows/ci.yml`）每次推送 main 跑 typecheck/单元/扩展与脚本构建/e2e；`release.yml` 在 `v*` 标签上校验版本并发布扩展 zip、`.user.js` 和 `.meta.js`。
- 已实现：KaTeX 失败/偏好命令升级、完整模式、原文公式原位渲染（含题目卡片 label）、```latex 代码块预览失败恢复、
  懒渲染（真实滚动容器为根）、批处理观察器、关闭精确还原、选择复制/Alt+单击复制、弹出界面、调试日志
  （页面控制台 `localStorage.setItem('alr-debug','1')`）。
- 0.3.0：`src/sites/sites.ts` 站点清单（23 个网站）生成 manifest matches 与 `@match`；按网站开关；`data-math-source`（ChatGPT 新版）/
  `data-math`（Gemini）源码恢复；面板不用 innerHTML（Trusted Types）；样式走可构造样式表（CSP）。
  ChatGPT 以外的网站只在模拟页 e2e 验证，选择器来自开源项目 ophel，**未在真实网站逐一验收**。ChatGPT 新版 `data-math-source` 结构也只来自 ophel 的记录，未亲自观察。
- 油猴版：约 1.94 MiB，内置引擎与基础字形；额外字形为固定版本 JSON（40 个区段），下载后校验哈希并缓存，不执行远程代码。两种版本以 DOM 标记互斥。
- 设备：Mac 项目 `/Users/meta/Project/Workspaces/chatgpt-advanced-latex-renderer`（Mac 无 Playwright 浏览器，e2e 在 OMEN 跑）；
  OMEN 项目 `C:\Users\Meta\Project\Workspaces\chatgpt-latex-renderer`（注意目录名不同），其 Chrome 默认配置以“加载已解压”方式加载该目录的 `dist/`，
  有 Playwright chromium-1208，2026-11-07 已更新到 0.3.0 并构建（Chrome 需在扩展页“重新加载”才会用新 manifest）。
  ROG 2026-11-07 前没有任何安装（Tampermonkey `gcalenpjmijncebpfijmoaglllgpjagf` 里无本脚本、无解压扩展）；已克隆到
  `C:\Users\Meta\Project\Workspaces\chatgpt-advanced-latex-renderer` 并构建 `dist/`，等用户在 Chrome 里加载或从 Release 安装油猴脚本。
- 已知待确认：代码块多行公式改为内联 `display:block` 后未在真实页复看；Edge 未实测；真实 Tampermonkey 未验收。
- 恢复入口：`pnpm install && pnpm build`，Chrome 加载 `dist/`（内容脚本主模块运行时读盘，改代码后刷新页面即可；改 manifest/content.css 需在扩展页重新加载）。

## Active Work
- [待验收] 各新网站真实页面：登录后打开含公式的对话，确认 `data-alr-runtime` 存在、`\ce` 被升级、用户消息未被处理；不对就修 `src/sites/sites.ts`。
- [待验收] 真实 Tampermonkey（ROG）+ 真实网站。
- [待办] Chrome Web Store / Edge Add-ons 上架（需用户的开发者账号）。
- 已完成的历史工作见 `docs/log/`。

## Build / Run / Test
- `pnpm install`；`pnpm build`（vite build + `scripts/check-dist.mjs` 产物检查：无远程导入/eval、预加载依赖为空）。
- `pnpm test`（Vitest：tests/unit）；`pnpm typecheck`。
- `pnpm build:userscript && pnpm test:userscript`：生成字形 JSON/清单与脚本，再运行 GM 垫片 e2e。
- `userscript/fonts/*.json` 和 `src/userscript/fontManifest.ts` 必须提交到版本标签；发布后脚本按该标签请求数据。构建后用 `git diff --exit-code -- userscript/fonts src/userscript/fontManifest.ts` 检查生成结果稳定。
- `pnpm build && pnpm test:e2e`（Playwright，复用本机 `%LOCALAPPDATA%\ms-playwright\chromium-*`，可用 `CHROMIUM_PATH` 指定；
  截图与结果在 `test-results/`）。Mac 上没有 Playwright 浏览器：推临时分支后在 OMEN 用 .ps1 跑（SSH 下可正常加载扩展）。
- 改 `src/sites/sites.ts` 后用 `matchPatterns()` / `originPatterns()` 的输出更新 `public/manifest.json`（单元测试与脚本构建都会校验）。
- 改 `src/dom/*`、`src/content/*` 后必须跑 e2e；改 engine/宏/预处理后跑单元测试（引擎测试是真实 MathJax 编译）。
- 真实页面只读探针：`node tests/real/build-probe.mjs` → 把 `test-results/probe/probe.js` 内容注入页面后 `ALRProbe.run()`。
- `scripts/probe-chatgpt.mjs`（Playwright 打开 chatgpt.com）会被 Cloudflare 人机验证拦截，不能用于自动化；真实页面验证需用户已登录的 Chrome。

## Design docs（修改对应模块前必读）
- [docs/design/chatgpt-dom.md](docs/design/chatgpt-dom.md)：真实 DOM 观察、源码恢复/失败检测、React 安全的 DOM 修改、原位替换、代码块预览、滚动容器。
- [docs/design/mathjax-engine.md](docs/design/mathjax-engine.md)：打包与按需加载、mhchem 字体扩展、宏包冲突策略、兼容模式触发条件。
- [docs/design/sites.md](docs/design/sites.md)：站点清单、选择器退回策略、各网站公式源码标记、CSP/Trusted Types、按网站开关。
- [docs/design/userscript.md](docs/design/userscript.md)：脚本存储、共享界面、字形数据与完整性校验、两种运行时共存和验证边界。

## Durable Lessons
- 对 React 页面不要“隐藏原块 + 克隆”：克隆节点没有 React 事件和后续属性更新（真实题目单选失去反馈）。只改文本节点 `data` 并插入自有节点，记录原值精确还原。
- MathJax 4 的 mhchem 箭头在独立的 `@mathjax/mathjax-mhchem-font-extension` 中，缺失时静默输出空 `<text>`；要用“无缺字形”断言测试。
- MathJax 包优先级数字越小越优先，braket 自带 3 会压过 physics；用 `['braket', 10]`。测试冲突语义时不要用“两种写法输出相同”这种两边都错也会通过的断言。
- ChatGPT 消息在 `.thread-scroll-container` 内滚动；块公式盒 `overflow:auto` 但不滚动。IO 必须以真实滚动容器为根。
- 在 Bash 工具里用 heredoc / `node -e` 写含反斜杠的 TS/正则会被吞掉反斜杠；含 LaTeX 的代码一律用文件编辑工具写。
- 页面自己的复制处理器会克隆选区并忽略 CSS：任何“隐藏原节点 + 显示替代节点”的方案都要接管复制，否则内容重复。
- physics 宏包不只是冲突 `\bra/\qty`，还把 `\ln \sin \exp` 等的 `[...]` 变成幂次；化学动力学的 `\ln[\ce{A}]` 会被误渲染。新增宏包前检查它重定义的所有标准命令。
- `web_accessible_resources.matches` 只能是 `/*` 路径；任何一条非法都会让 Chrome 拒绝加载整个扩展，e2e 只表现为“等不到 service worker”。
- Google 系网站的 Trusted Types 会让页面世界里的 `innerHTML = 字符串` 抛错（油猴脚本），只用 DOM API / `src/ui/html.ts` 构建节点。
- 在渲染循环里读取布局（clientWidth/getComputedStyle）会在每次插入后强制整页重排；在快机器上看不出来，必须在大页面、慢机器上测。
