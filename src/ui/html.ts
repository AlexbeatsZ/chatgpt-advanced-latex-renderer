/**
 * Builds DOM from our own static markup without assigning to innerHTML. Pages such as Gemini and
 * AI Studio enforce Trusted Types (`require-trusted-types-for 'script'`), where any string
 * assigned to innerHTML / passed to DOMParser throws in the page's world (userscript panel).
 * The markup is a constant written by us: simple tags, quoted attributes, no comments/scripts.
 */
const VOID = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function buildFragment(doc: Document, markup: string): DocumentFragment {
  const frag = doc.createDocumentFragment();
  const stack: Node[] = [frag];
  const re = /<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[\w:-]+(?:\s*=\s*"[^"]*")?)*)\s*(\/?)>|([^<]+)/g;
  for (let m = re.exec(markup); m; m = re.exec(markup)) {
    const top = stack[stack.length - 1];
    if (m[1]) {
      if (stack.length > 1) stack.pop();
    } else if (m[2]) {
      const el = doc.createElement(m[2]);
      for (const a of m[3].matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) el.setAttribute(a[1], decode(a[2] ?? ''));
      top.appendChild(el);
      if (!m[4] && !VOID.has(m[2].toLowerCase())) stack.push(el);
    } else if (m[5]) {
      top.appendChild(doc.createTextNode(decode(m[5])));
    }
  }
  return frag;
}
