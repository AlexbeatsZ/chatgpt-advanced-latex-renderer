// @vitest-environment jsdom
// Site registry, per-site message scope and the source-carrying formula wrappers other chat
// pages use. DOM snippets mirror the structures documented in docs/design/sites.md.
import fs from 'node:fs';
import { describe, expect, it, beforeEach } from 'vitest';
import { matchPatterns, originPatterns, siteFor, SITES } from '../../src/sites/sites';
import { authorOf, configureSite, messageRoots } from '../../src/dom/scope';
import { detectFailure, findRenderedUnits, getTexSource, isDisplayUnit } from '../../src/dom/katex';
import { buildFragment } from '../../src/ui/html';
import { PANEL_HTML } from '../../src/ui/panel';
import { enabledOn, normalizeSettings } from '../../src/shared/settings';

const katex = (tex: string, cls = 'katex') =>
  `<span class="${cls}"><span class="katex-mathml"><math><semantics><mrow></mrow><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span><span class="katex-html">x</span></span>`;
const katexHtmlOnly = (body = 'x') => `<span class="katex"><span class="katex-html">${body}</span></span>`;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('site registry', () => {
  it('manifest matches are generated from the site list', () => {
    const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
    expect(manifest.content_scripts[0].matches).toEqual(matchPatterns());
    // web_accessible_resources only accepts path "/*" (anything else: the extension fails to load)
    expect(manifest.web_accessible_resources[0].matches).toEqual(originPatterns());
    for (const p of originPatterns()) expect(p).toMatch(/^https:\/\/[^/]+\/\*$/);
  });

  it('site ids are unique and patterns are valid Chrome match patterns', () => {
    expect(new Set(SITES.map((s) => s.id)).size).toBe(SITES.length);
    for (const p of matchPatterns()) expect(p).toMatch(/^https:\/\/(\*\.)?[a-z0-9.-]+\/[^*]*\*$/);
  });

  it('resolves hosts, subdomains and paths', () => {
    expect(siteFor('chatgpt.com').id).toBe('chatgpt');
    expect(siteFor('chat.openai.com').id).toBe('chatgpt');
    expect(siteFor('claude.ai').id).toBe('claude');
    expect(siteFor('gemini.google.com').id).toBe('gemini');
    expect(siteFor('aistudio.google.com').id).toBe('aistudio');
    expect(siteFor('chat.deepseek.com').id).toBe('deepseek');
    expect(siteFor('assistant.grok.com').id).toBe('grok');
    expect(siteFor('huggingface.co', '/chat/conversation/1').id).toBe('huggingchat');
    expect(siteFor('huggingface.co', '/models').id).toBe('huggingface.co'); // generic profile
    expect(siteFor('example.org').assistant).toEqual([]);
  });

  it('per-site switch', () => {
    const s = normalizeSettings({ disabledSites: ['claude', 3, 'claude'] });
    expect(s.disabledSites).toEqual(['claude']);
    expect(enabledOn(s, 'claude')).toBe(false);
    expect(enabledOn(s, 'gemini')).toBe(true);
    expect(enabledOn({ ...s, enabled: false }, 'gemini')).toBe(false);
    expect(normalizeSettings({ disabledSites: 'x' }).disabledSites).toEqual([]);
  });
});

describe('message scope per site', () => {
  const cases: [string, string, string][] = [
    ['claude.ai', '<div data-testid="user-message">q $x$</div>', '<div class="font-claude-response"><p>a</p></div>'],
    ['gemini.google.com', '<user-query><p>q</p></user-query>', '<model-response><message-content><p>a</p></message-content></model-response>'],
    ['aistudio.google.com', '<div class="chat-turn-container user">q</div>', '<div class="chat-turn-container model"><p>a</p></div>'],
    ['grok.com', '<div data-testid="user-message">q</div>', '<div data-testid="assistant-message"><p>a</p></div>'],
    ['www.kimi.com', '<div class="segment segment-user">q</div>', '<div class="segment segment-assistant"><p>a</p></div>'],
    ['yuanbao.tencent.com', '<div class="agent-chat__list__item--human">q</div>', '<div class="agent-chat__list__item--ai"><p>a</p></div>'],
  ];
  for (const [host, user, assistant] of cases) {
    it(host, () => {
      configureSite(siteFor(host));
      document.body.innerHTML = `<main>${user}${assistant}</main>`;
      expect(messageRoots(document.body, true).map(authorOf)).toEqual(['user', 'assistant']);
      expect(messageRoots(document.body, false).map(authorOf)).toEqual(['assistant']);
    });
  }

  it('unknown sites have no markers (controller falls back to <main>)', () => {
    configureSite(siteFor('example.org'));
    document.body.innerHTML = '<main><div class="prose"><p>$x$</p></div></main>';
    expect(messageRoots(document.body, true)).toEqual([]);
  });

  it('shared data-message-author-role markers work everywhere', () => {
    configureSite(siteFor('chat.mistral.ai'));
    document.body.innerHTML = '<div data-message-author-role="assistant"><p>a</p></div>';
    expect(messageRoots(document.body, false).length).toBe(1);
  });
});

describe('source-carrying formula wrappers', () => {
  it('ChatGPT data-math-source wrapper without MathML is one unit', () => {
    document.body.innerHTML = `<p>a <span role="math" data-math-source="\\ce{H2O}" data-client-katex-layout="">${katexHtmlOnly(
      '<span class="mord" style="color: rgb(204, 0, 0);">\\ce</span>',
    )}</span> b</p>`;
    const units = findRenderedUnits(document);
    expect(units.length).toBe(1);
    expect(units[0].getAttribute('role')).toBe('math');
    expect(getTexSource(units[0])).toBe('\\ce{H2O}');
    expect(isDisplayUnit(units[0])).toBe(false);
    expect(detectFailure(units[0])).toEqual({ failed: true, commands: ['ce'] });
  });

  it('display wrapper', () => {
    document.body.innerHTML = `<div data-d-block=""><span role="math" data-math-source="x^2">${katex('x^2', 'katex-display')}</span></div>`;
    const [u] = findRenderedUnits(document);
    expect(isDisplayUnit(u)).toBe(true);
  });

  it('Gemini .math-inline[data-math] with HTML-only KaTeX', () => {
    document.body.innerHTML = `<span class="math-inline" data-math="\\frac{a}{b}">${katexHtmlOnly()}</span>`;
    const [u] = findRenderedUnits(document);
    expect(u.matches('.katex')).toBe(true);
    expect(getTexSource(u)).toBe('\\frac{a}{b}');
  });

  it('DeepSeek / Claude plain KaTeX with annotation', () => {
    document.body.innerHTML = `<div class="ds-markdown"><p>${katex('\\pu{25 kJ}')}</p></div>`;
    expect(findRenderedUnits(document).map(getTexSource)).toEqual(['\\pu{25 kJ}']);
  });
});

describe('Trusted-Types-safe panel markup', () => {
  it('builds the panel without innerHTML', () => {
    const frag = buildFragment(document, PANEL_HTML);
    const div = document.createElement('div');
    div.appendChild(frag);
    for (const id of ['enabled', 'siteEnabled', 'rerender', 'scale', 'macros', 'prefer', 'altClickCopy', 'flavor', 'mj-version']) {
      expect(div.querySelector(`#${id}`), id).not.toBeNull();
    }
    expect(div.querySelector('#site-row')!.hasAttribute('hidden')).toBe(true);
    expect(div.querySelectorAll('input[name=mode]').length).toBe(2);
    expect(div.querySelector('#scale')!.getAttribute('max')).toBe('200');
    // Same structure as the browser's own parser.
    const ref = document.createElement('div');
    ref.innerHTML = PANEL_HTML;
    expect(div.innerHTML.replace(/\s+/g, ' ')).toBe(ref.innerHTML.replace(/\s+/g, ' '));
  });
});
