# 多站点适配设计

> 修改 `src/sites/sites.ts`、`src/dom/scope.ts`、`src/dom/katex.ts` 的源码恢复部分前先读本文。ChatGPT 的真实 DOM 观察见 [chatgpt-dom.md](chatgpt-dom.md)。

## 单一站点清单
- `src/sites/sites.ts` 的 `SITES` 是唯一来源：域名（`.example.com` 表示含子域）、可选路径前缀、助手/用户消息选择器。
- `matchPatterns()` → manifest `content_scripts.matches` 与油猴 `@match`；`originPatterns()` → `web_accessible_resources.matches`。
  `scripts/build-userscript.mjs` 在两者不一致时直接报错，`tests/unit/sites.test.ts` 也检查 manifest。
- 新增网站：在 `SITES` 加一项 → 重新生成 `public/manifest.json` 的两个 `matches`（用 `matchPatterns()` / `originPatterns()` 的输出）→ README 网站表。

## 选择器的地位
- 选择器只用来 **缩小扫描范围、区分用户消息**（“同时处理我发送的消息”选项）。所有网站都额外合并通用标记
  `[data-message-author-role]`、`[data-role]`。
- 选择器全部失效（网站改版）时 `Controller.rootsFor` 退回 `<main>` / 整页，公式照样处理；只是用户消息也会被处理。
  因此宁可少写选择器，也不要写可能匹配到侧栏、输入框的宽泛选择器。
- `configureSite` 逐条校验选择器（`:has()` 等在旧浏览器不支持时只丢弃那一条），因为逗号连接的选择器里一条非法会让整组失效。
- 选择器来源：ChatGPT 为真实页面观察；其余取自活跃维护的开源多站点扩展 urzeye/ophel（2026-11-06 版本的 `src/adapters/*-config.ts`），
  **未在真实网站逐一验证**。验证某网站时在其页面控制台跑 `tests/real/` 的探针，或检查 `document.querySelectorAll(<选择器>)`。

## 源码恢复（各网站的公式标记）
| 标记 | 网站 | 处理 |
|---|---|---|
| `.katex` + MathML `annotation[encoding=application/x-tex]` | Claude、DeepSeek、Grok、Kimi 等多数网站；ChatGPT 旧版 | 原有路径 |
| `span[role=math][data-math-source]` 包着**只有 HTML 输出**的 KaTeX（无 MathML，`data-client-katex-layout`） | ChatGPT 新版（ophel 2026-11 记录） | 包装元素本身就是单元（`HOST_SELECTOR`），被隐藏并替换；内部 `.katex` 不再单独计 |
| `.math-inline` / `.math-block[data-math]` 包着 `.katex` | Gemini（豆包也用 `data-math`） | 单元仍是 `.katex`，源码向上 2 层祖先找 `data-math` |
| `data-latex` / `data-tex` / `data-formula` | 少数网站、MathJax 4 | 同上 |
- 失败检测：无 MathML 时 `[mathcolor]` 不存在，只能靠 HTML 侧红字（`style` 中 `rgb(204,0,0)` / `#cc0000`），因此红字检测不再限定在 `.katex-html` 内。
- `[data-math-source]` 也加入了原文扫描的排除区，避免其中文字被当成原文公式。

## 安全策略（CSP / Trusted Types）
- Google 系网站（Gemini、AI Studio、NotebookLM）启用 Trusted Types：页面世界里给 `innerHTML` 赋字符串会抛错（油猴脚本受影响）。
  设置面板改用 `src/ui/html.ts` 的小型解析器从静态模板构建 DOM；新代码**不要**再给 innerHTML/outerHTML 赋值（读取不受影响）。
- `style-src` 限制 `<style>` 元素时：扩展的 `content.css` 由 manifest 注入不受影响；MathJax 样式表在 `<style>` 无效时退回
  `document.adoptedStyleSheets`；油猴脚本的样式和面板（Shadow DOM）直接用可构造样式表。
- e2e 用模拟页 + 真实响应头覆盖：Claude（`style-src-elem 'self'`）、Gemini（`require-trusted-types-for 'script'`），并断言无违规报告。

## 按网站开关
- 设置 `disabledSites: string[]`（站点 id）；`enabledOn(settings, siteId)` = 全局开关且未在该站关闭。面板在连接到页面后显示“在 X 上启用”。
- 未列出的网站使用以域名为 id 的通用配置（只有通用标记）；目前内容脚本只注入列出的网站，通用配置用于测试与将来的自定义站点。

## 失败方案
- `web_accessible_resources.matches` 只接受路径为 `/*` 的模式；写成 `https://huggingface.co/chat*` 会让 Chrome **拒绝加载整个扩展**
  （e2e 表现为等不到 service worker），所以单独生成 `originPatterns()`。
