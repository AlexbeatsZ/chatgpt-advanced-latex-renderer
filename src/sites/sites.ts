/**
 * Supported sites. One list drives the manifest `matches`, the userscript `@match` lines
 * (scripts/build-userscript.mjs) and the message-container selectors used at runtime.
 * See docs/design/sites.md before changing selectors.
 *
 * Selectors only narrow WHERE we look (and tell assistant from user messages). If none of a
 * site's selectors match (the site changed its DOM), scanning falls back to <main> / the page,
 * so formulas still render; only the "skip my own messages" option stops working there.
 */
export interface Site {
  id: string;
  name: string;
  /** Exact hostnames; an entry starting with "." also matches every subdomain. */
  hosts: string[];
  /** URL path prefixes the site lives under (default: the whole host). */
  paths?: string[];
  /** Containers of one assistant answer (outermost wins). Empty: no reliable marker. */
  assistant: string[];
  /** Containers of one user message. */
  user: string[];
}

/** Markers several chat UIs share; used for sites without their own entry and merged into every site. */
const COMMON_ASSISTANT = ['[data-message-author-role="assistant"]', '[data-role="assistant"]'];
const COMMON_USER = ['[data-message-author-role="user"]', '[data-role="user"]'];

export const SITES: Site[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    hosts: ['chatgpt.com', 'chat.openai.com'],
    assistant: [
      '[data-content-search-unit-key$=":assistant"]',
      '[data-chatgpt-search-unit-key$=":assistant"]',
      '[data-markdown-text-style="assistant-message"]',
    ],
    user: ['[data-content-search-unit-key$=":user"]', '[data-chatgpt-search-unit-key$=":user"]'],
  },
  {
    id: 'claude',
    name: 'Claude',
    hosts: ['claude.ai'],
    assistant: ['.font-claude-response', '.font-claude-message', '[data-is-streaming]'],
    user: ['[data-testid="user-message"]'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    hosts: ['gemini.google.com', 'business.gemini.google'],
    assistant: ['model-response', '.model-response-container'],
    user: ['user-query'],
  },
  {
    id: 'aistudio',
    name: 'Google AI Studio',
    hosts: ['aistudio.google.com'],
    assistant: ['.chat-turn-container.model'],
    user: ['.chat-turn-container.user'],
  },
  {
    id: 'notebooklm',
    name: 'NotebookLM',
    hosts: ['notebooklm.google.com'],
    assistant: ['.to-user-container', 'chat-message .to-user-message-card-content'],
    user: ['.from-user-container'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    hosts: ['chat.deepseek.com'],
    assistant: ['.ds-message:has(.ds-markdown)', '.ds-markdown'],
    user: ['.ds-message:not(:has(.ds-markdown))'],
  },
  {
    id: 'grok',
    name: 'Grok',
    hosts: ['grok.com', '.grok.com'],
    assistant: ['[data-testid="assistant-message"]', '.message-bubble:not(.rounded-br-lg):not([data-testid="user-message"])'],
    user: ['[data-testid="user-message"]', '.message-bubble.rounded-br-lg'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    hosts: ['www.kimi.com', 'kimi.com', 'www.kimi.ai', 'kimi.moonshot.cn'],
    assistant: ['.segment.segment-assistant', '.segment-assistant'],
    user: ['.segment.segment-user', '.segment-user'],
  },
  {
    id: 'doubao',
    name: '豆包',
    hosts: ['www.doubao.com', 'doubao.com'],
    assistant: ['[data-message-id]:not(.justify-end)', '.flow-markdown-body', '.md-box-root'],
    user: ['[data-message-id].justify-end'],
  },
  {
    id: 'qwen',
    name: 'Qwen Chat',
    hosts: ['chat.qwen.ai'],
    assistant: ['.qwen-chat-message-assistant'],
    user: ['.qwen-chat-message-user', '.chat-user-message-wrapper'],
  },
  {
    id: 'qianwen',
    name: '通义千问',
    hosts: ['www.qianwen.com', 'qianwen.com', 'www.tongyi.com', 'tongyi.aliyun.com'],
    assistant: ['[class*="answerItem"]', '[data-chat-answers-wrap]', '.chat-answers-card-wrap'],
    user: ['[class*="questionItem"]', '.chat-question-wrap', '[data-chat-question-wrap]'],
  },
  {
    id: 'yuanbao',
    name: '腾讯元宝',
    hosts: ['yuanbao.tencent.com'],
    assistant: ['.agent-chat__list__item--ai'],
    user: ['.agent-chat__list__item--human'],
  },
  {
    id: 'chatglm',
    name: '智谱清言',
    hosts: ['chatglm.cn'],
    assistant: ['.answer-content-wrap'],
    user: ['.conversation.question'],
  },
  {
    id: 'zai',
    name: 'Z.ai',
    hosts: ['chat.z.ai'],
    assistant: ['[id^="message-"]:not(.user-message)'],
    user: ['[id^="message-"].user-message', '.user-message'],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    hosts: ['www.perplexity.ai', 'perplexity.ai'],
    assistant: ['[id^="markdown-content-"]', '.prose'],
    user: [],
  },
  {
    id: 'copilot',
    name: 'Microsoft Copilot',
    hosts: ['copilot.microsoft.com'],
    assistant: ['[data-content="ai-message"]'],
    user: ['[data-content="user-message"]'],
  },
  { id: 'mistral', name: 'Le Chat', hosts: ['chat.mistral.ai'], assistant: [], user: [] },
  { id: 'poe', name: 'Poe', hosts: ['poe.com'], assistant: ['[class*="Message_botMessageBubble"]'], user: ['[class*="Message_humanMessageBubble"]'] },
  { id: 'lmarena', name: 'LMArena', hosts: ['lmarena.ai', 'beta.lmarena.ai'], assistant: [], user: [] },
  { id: 'huggingchat', name: 'HuggingChat', hosts: ['huggingface.co'], paths: ['/chat'], assistant: [], user: [] },
  { id: 'openrouter', name: 'OpenRouter', hosts: ['openrouter.ai'], paths: ['/chat'], assistant: [], user: [] },
  { id: 'metaso', name: '秘塔 AI 搜索', hosts: ['metaso.cn'], assistant: [], user: [] },
  { id: 'minimax', name: 'MiniMax', hosts: ['agent.minimaxi.com', 'agent.minimax.io', 'chat.minimaxi.com', 'chat.minimax.io'], assistant: [], user: [] },
];

/** Chrome match patterns (manifest `matches`, userscript `@match`) for all sites. */
export function matchPatterns(sites: Site[] = SITES): string[] {
  const out: string[] = [];
  for (const s of sites) {
    for (const h of s.hosts) {
      const host = h.startsWith('.') ? `*${h}` : h;
      for (const p of s.paths ?? ['/']) out.push(`https://${host}${p === '/' ? '/*' : `${p}*`}`);
    }
  }
  return [...new Set(out)];
}

/**
 * Origin-only patterns (path `/*`): `web_accessible_resources.matches` rejects any other path, and
 * an invalid entry makes Chrome refuse to load the whole extension.
 */
export function originPatterns(sites: Site[] = SITES): string[] {
  return [...new Set(sites.flatMap((s) => s.hosts.map((h) => `https://${h.startsWith('.') ? `*${h}` : h}/*`)))];
}

function hostMatches(pattern: string, hostname: string): boolean {
  return pattern.startsWith('.') ? hostname.endsWith(pattern) : hostname === pattern;
}

/** The site entry for a location, or a generic profile (no markers of its own) for unlisted pages. */
export function siteFor(hostname: string, pathname = '/'): Site {
  const found = SITES.find(
    (s) => s.hosts.some((h) => hostMatches(h, hostname)) && (!s.paths || s.paths.some((p) => pathname.startsWith(p))),
  );
  return found ?? { id: hostname || 'local', name: hostname || 'local', hosts: [hostname], assistant: [], user: [] };
}

/** Assistant / user selectors for a site, including the shared markers. */
export function selectorsFor(site: Site): { assistant: string[]; user: string[] } {
  return { assistant: [...COMMON_ASSISTANT, ...site.assistant], user: [...COMMON_USER, ...site.user] };
}
