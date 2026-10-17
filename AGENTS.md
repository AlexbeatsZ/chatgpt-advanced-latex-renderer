# AGENTS.md

## Goal
Chrome/Edge MV3 扩展，为 chatgpt.com 提供本地 MathJax 4 增强 LaTeX 渲染（mhchem、physics、AMS、自定义宏），
不改 ChatGPT 原始内容、不上传数据。需求原文要点：兼容增强（默认）/完整 MathJax/关闭三态；从 DOM 恢复原始
TeX（annotation 优先，绝不反推）；流式、长对话、内部导航兼容；不破坏代码复制/选择/编辑/表格；构建时打包、无 CDN；
弹出界面含开关、模式、重新渲染、状态与错误、字号、自定义宏。

## Current State
- 版本 0.1.0，分支 main，远端公开仓库 https://github.com/AlexbeatsZ/chatgpt-advanced-latex-renderer 。
  CI（`.github/workflows/ci.yml`）每次推送 main 跑 typecheck/单元/构建/e2e；`release.yml` 在 `v*` 标签上校验版本并发布 zip。
- 已实现：KaTeX 失败/偏好命令升级、完整模式、原文公式原位渲染（含题目卡片 label）、```latex 代码块预览失败恢复、
  懒渲染（真实滚动容器为根）、批处理观察器、关闭精确还原、选择复制/Alt+单击复制、弹出界面、调试日志
  （页面控制台 `localStorage.setItem('alr-debug','1')`）。
- 测试：148 单元 + 15 e2e 全过；真实 chatgpt.com 已验证（见 README“验证状态”）。
- 已知待确认：代码块多行公式改为内联 `display:block` 后未在真实页复看；Edge 未实测。
- 恢复入口：`pnpm install && pnpm build`，Chrome 加载 `dist/`。用户的 Windows Chrome 已加载本项目 `dist/`
  （内容脚本主模块运行时读盘，改代码后刷新页面即可；改 manifest/content.css 需在扩展页重新加载）。

## Active Work
- [完成] GitHub 公开仓库 + CI + Release 工作流。
- [完成] Release v0.1.0（2026-10-17）：https://github.com/AlexbeatsZ/chatgpt-advanced-latex-renderer/releases/tag/v0.1.0 ，zip（约 3.5 MB，根目录即 manifest.json）+ SHA-256。
- [待办] Chrome Web Store / Edge Add-ons 上架（需用户的开发者账号）；油猴脚本版本（用户提过，未开始）。
- [完成] 核心渲染、DOM 适配、测试体系、文档、许可证审查（依赖全为 Apache-2.0，参考项目未复制代码）。

## Build / Run / Test
- `pnpm install`；`pnpm build`（vite build + `scripts/check-dist.mjs` 产物检查：无远程导入/eval、预加载依赖为空）。
- `pnpm test`（Vitest：tests/unit）；`pnpm typecheck`。
- `pnpm build && pnpm test:e2e`（Playwright，复用本机 `%LOCALAPPDATA%\ms-playwright\chromium-*`，可用 `CHROMIUM_PATH` 指定；
  截图与结果在 `test-results/`）。
- 改 `src/dom/*`、`src/content/*` 后必须跑 e2e；改 engine/宏/预处理后跑单元测试（引擎测试是真实 MathJax 编译）。
- 真实页面只读探针：`node tests/real/build-probe.mjs` → 把 `test-results/probe/probe.js` 内容注入页面后 `ALRProbe.run()`。
- `scripts/probe-chatgpt.mjs`（Playwright 打开 chatgpt.com）会被 Cloudflare 人机验证拦截，不能用于自动化；真实页面验证需用户已登录的 Chrome。

## Design docs（修改对应模块前必读）
- [docs/design/chatgpt-dom.md](docs/design/chatgpt-dom.md)：真实 DOM 观察、源码恢复/失败检测、React 安全的 DOM 修改、原位替换、代码块预览、滚动容器。
- [docs/design/mathjax-engine.md](docs/design/mathjax-engine.md)：打包与按需加载、mhchem 字体扩展、宏包冲突策略、兼容模式触发条件。

## Durable Lessons
- 对 React 页面不要“隐藏原块 + 克隆”：克隆节点没有 React 事件和后续属性更新（真实题目单选失去反馈）。只改文本节点 `data` 并插入自有节点，记录原值精确还原。
- MathJax 4 的 mhchem 箭头在独立的 `@mathjax/mathjax-mhchem-font-extension` 中，缺失时静默输出空 `<text>`；要用“无缺字形”断言测试。
- MathJax 包优先级数字越小越优先，braket 自带 3 会压过 physics；用 `['braket', 10]`。测试冲突语义时不要用“两种写法输出相同”这种两边都错也会通过的断言。
- ChatGPT 消息在 `.thread-scroll-container` 内滚动；块公式盒 `overflow:auto` 但不滚动。IO 必须以真实滚动容器为根。
- 在 Bash 工具里用 heredoc / `node -e` 写含反斜杠的 TS/正则会被吞掉反斜杠；含 LaTeX 的代码一律用文件编辑工具写。
