# 油猴脚本版本设计

> 修改 `src/userscript/*`、`scripts/gen-userscript-fonts.mjs`、`scripts/build-userscript.mjs` 前先读本文。

## 与扩展共用什么
- 完全共用：`src/content/controller.ts`（扫描、渲染、原位替换、懒渲染）、`src/dom/*`、`src/tex/*`、`src/render/engine.ts`、
  设置面板 `src/ui/panel.ts`。
- 平台差异只有三处：
  1. 引擎加载：`Controller` 构造参数 `loadEngine()`。扩展 = 运行时 import `content/engine.js`；脚本 = 已打包，直接 `createDomEngine(cfg, jsonFontLoader)`。
  2. 设置存储：`SettingsStore` 接口。扩展 = `chrome.storage.local`；脚本 = `GM_getValue/GM_setValue`（无 `GM_addValueChangeListener` 时保存后本地直接应用）。
  3. 面板：扩展弹出页通过 `chrome.tabs` 消息；脚本在页面内用 Shadow DOM 打开（油猴菜单“⚙ Advanced LaTeX 设置”），直接调用 controller。

## 字体：数据而非代码
- MathJax 的 40 个动态字形区段原本是调用 `MathJaxNewcmFont.dynamicSetup(...)` 的 ES 模块。构建时
  `gen-userscript-fonts.mjs` 拦截该调用，把参数序列化为 `userscript/fonts/<区段>.json`（共约 9.7 MiB，提交进仓库），
  并生成 `src/userscript/fontManifest.ts`（每个文件的 SHA-256，编译进脚本）。
- 运行时：缓存（`GM_*` 存储，键含哈希）→ jsDelivr `gh/<repo>@v<版本>` → GitHub raw `<repo>/v<版本>`；
  每份数据先校验 SHA-256 再 `JSON.parse` 并调用 `dynamicSetup`。**下载内容从不被执行**；篡改/损坏的数据被拒绝并尝试下一来源；
  校验通过才写缓存，因此首次用到某区段后即可离线。启动时删除不属于当前清单的旧缓存。
- 基础字体（常用拉丁、希腊、运算符、mhchem 箭头）随脚本打包，大多数化学/物理公式不需要任何网络请求。
- URL 固定到发布标签：字体 JSON 必须在该标签的提交中，CI 与 Release 工作流用 `git diff --exit-code` 确认提交的数据与重新生成的一致。

## 与扩展共存
二者在不同隔离环境，看不到对方的全局变量，但共享 DOM：先启动的一方在 `<html data-alr-runtime>` 上声明，
另一方保持空闲（`src/content/runtimeGuard.ts`）。弹出页/面板会显示“本页已由另一版本处理”。

## 已知限制
- Chrome 138+ 的 Tampermonkey（MV3）需要在扩展详情里打开“允许用户脚本”（或开发者模式），否则任何脚本都不运行。
- 首次遇到不在基础字体中的字形时需要联网；jsDelivr 与 GitHub 在国内都可能不稳定（有两级回退与本地缓存）。
- `@downloadURL/@updateURL` 指向 GitHub Releases 的 latest；更新检查依赖能访问 GitHub。
- 测试：`tests/e2e/run-userscript-e2e.mjs` 用 GM_* 垫片代替真实 Tampermonkey；真实 Tampermonkey 下的行为需手动确认。
