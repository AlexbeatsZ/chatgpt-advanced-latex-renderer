/** Small TeX tokenizing helpers shared by macro parsing and preprocessing. */

export interface Group {
  content: string;
  start: number; // index of "{"
  end: number; // index after "}"
}

export function skipSpaces(s: string, i: number): number {
  while (i < s.length && /\s/.test(s[i])) i++;
  return i;
}

/** Reads a balanced `{...}` group starting exactly at `i`. Returns null if unbalanced. */
export function readGroup(s: string, i: number): Group | null {
  if (s[i] !== '{') return null;
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') {
      j++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { content: s.slice(i + 1, j), start: i, end: j + 1 };
    }
  }
  return null;
}

/** Reads an optional `[...]` argument at `i` (brace-aware). */
export function readOptional(s: string, i: number): Group | null {
  if (s[i] !== '[') return null;
  let depth = 0;
  for (let j = i + 1; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') {
      j++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === ']' && depth === 0) return { content: s.slice(i + 1, j), start: i, end: j + 1 };
  }
  return null;
}

/** Reads a control sequence name at `i` (which must be a backslash). */
export function readCommand(s: string, i: number): { name: string; end: number } | null {
  if (s[i] !== '\\') return null;
  const m = /^\\([a-zA-Z@]+|.)/.exec(s.slice(i, i + 64));
  if (!m) return null;
  return { name: m[1], end: i + m[0].length };
}

/** Reads either a `{group}` or a single token as a macro argument. */
export function readArgument(s: string, i: number): Group | null {
  i = skipSpaces(s, i);
  if (s[i] === '{') return readGroup(s, i);
  if (s[i] === '\\') {
    const c = readCommand(s, i);
    return c ? { content: s.slice(i, c.end), start: i, end: c.end } : null;
  }
  if (i < s.length && s[i] !== '}') return { content: s[i], start: i, end: i + 1 };
  return null;
}

/** Splits `s` at top-level (brace depth 0) unescaped occurrences of `sep` (single char). */
export function splitTopLevel(s: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  for (let j = 0; j < s.length; j++) {
    const ch = s[j];
    if (ch === '\\') {
      j++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === sep && depth === 0) {
      parts.push(s.slice(last, j));
      last = j + 1;
    }
  }
  parts.push(s.slice(last));
  return parts;
}

export function stripComments(s: string): string {
  return s
    .split('\n')
    .map((line) => {
      for (let j = 0; j < line.length; j++) {
        if (line[j] === '\\') {
          j++;
          continue;
        }
        if (line[j] === '%') return line.slice(0, j);
      }
      return line;
    })
    .join('\n');
}

/** Control-sequence names (without backslash) used in a TeX string. */
export function commandsIn(tex: string): Set<string> {
  const out = new Set<string>();
  const re = /\\([a-zA-Z]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tex))) out.add(m[1]);
  return out;
}
