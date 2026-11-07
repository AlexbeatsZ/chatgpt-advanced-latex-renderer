# 隐私说明 / Privacy

- 扩展只在 README“支持的网站”中列出的 AI 对话网站运行（ChatGPT、Claude、Gemini、AI Studio、DeepSeek 等，完整列表见 `public/manifest.json`），不申请访问所有网站的权限。
- 所有公式都在本地浏览器中用打包进扩展的 MathJax 渲染；**不向任何服务器发送聊天内容或其他数据**，没有统计、遥测或远程代码加载。
- 唯一权限 `storage` 用于把你的设置（开关、模式、字号、自定义宏等）保存在本机 `chrome.storage.local`。
- 扩展把 `content/*`、`chunks/*` 声明为对这些网站可访问的资源（用于按需加载 MathJax 与字体分片），因此网站理论上可以探测到扩展已安装；这些文件不包含任何个人数据。

- 油猴脚本版本：同样不发送聊天内容；唯一的网络请求是在需要基础字体之外的字形时，从 `cdn.jsdelivr.net` 或
  `raw.githubusercontent.com` 下载固定版本的字形数据（JSON），请求中不含任何页面内容，这些服务能看到你的 IP。
  设置与字形缓存保存在脚本管理器的本地存储中。

The extension runs only on the listed AI chat sites (ChatGPT, Claude, Gemini, AI Studio, DeepSeek, ...), renders formulas locally with a bundled
MathJax, sends no data anywhere (no telemetry, no remote code) and stores only its settings in
`chrome.storage.local`.
