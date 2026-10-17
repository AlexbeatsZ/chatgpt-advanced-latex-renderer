/**
 * Finds LaTeX math segments in plain text that was NOT rendered by the page.
 * Pure function: no DOM access. See docs/design/chatgpt-dom.md for the rules.
 */

export type Delim = '$' | '$$' | '\\(' | '\\[' | 'env';

export interface MathSegment {
  start: number; // index of the opening delimiter
  end: number; // index just after the closing delimiter
  tex: string; // TeX passed to the engine (without delimiters, except for envs)
  display: boolean;
  delim: Delim;
}

export interface ScanOptions {
  singleDollar: boolean;
  doubleDollar: boolean;
  parens: boolean; // \( \)
  brackets: boolean; // \[ \]
  environments: boolean; // bare \begin{align}...\end{align}
}

export const DEFAULT_SCAN: ScanOptions = {
  singleDollar: true,
  doubleDollar: true,
  parens: true,
  brackets: true,
  environments: true,
};

/** Character used by the DOM layer for regions math must not cross (code, existing math...). */
export const BARRIER = '￼';

const MATH_ENVS = new Set([
  'equation', 'equation*', 'align', 'align*', 'alignat', 'alignat*', 'gather', 'gather*',
  'multline', 'multline*', 'flalign', 'flalign*', 'eqnarray', 'eqnarray*',
]);

const PLACEHOLDER = /^[\s.…·⋯]*$/;

export function findMath(text: string, opts: ScanOptions = DEFAULT_SCAN): MathSegment[] {
  const out: MathSegment[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '\\') {
      const next = text[i + 1];
      if (next === '\\' || next === '$') {
        i += 2; // escaped backslash / literal dollar
        continue;
      }
      if ((next === '(' && opts.parens) || (next === '[' && opts.brackets)) {
        const close = next === '(' ? '\\)' : '\\]';
        const end = findClose(text, i + 2, close, true);
        if (end >= 0) {
          const body = text.slice(i + 2, end);
          if (isUsable(body)) {
            out.push({ start: i, end: end + 2, tex: body.trim(), display: next === '[', delim: next === '(' ? '\\(' : '\\[' });
            i = end + 2;
            continue;
          }
        }
        i += 2;
        continue;
      }
      if (opts.environments && text.startsWith('\\begin{', i)) {
        const m = /^\\begin\{([a-zA-Z]+\*?)\}/.exec(text.slice(i, i + 40));
        if (m && MATH_ENVS.has(m[1])) {
          const endTag = `\\end{${m[1]}}`;
          const endIdx = findClose(text, i + m[0].length, endTag, true);
          if (endIdx >= 0) {
            const full = text.slice(i, endIdx + endTag.length);
            out.push({ start: i, end: endIdx + endTag.length, tex: full, display: true, delim: 'env' });
            i = endIdx + endTag.length;
            continue;
          }
        }
      }
      i += 2;
      continue;
    }
    if (c === '$') {
      if (text[i + 1] === '$') {
        if (opts.doubleDollar) {
          const end = findClose(text, i + 2, '$$', true);
          if (end >= 0) {
            const body = text.slice(i + 2, end);
            if (isUsable(body)) {
              out.push({ start: i, end: end + 2, tex: body.trim(), display: true, delim: '$$' });
              i = end + 2;
              continue;
            }
          }
        }
        i += 2;
        continue;
      }
      if (opts.singleDollar) {
        const end = findSingleDollarClose(text, i + 1);
        if (end >= 0) {
          const body = text.slice(i + 1, end);
          if (isUsable(body)) {
            out.push({ start: i, end: end + 1, tex: body, display: false, delim: '$' });
            i = end + 1;
            continue;
          }
        }
      }
      i += 1;
      continue;
    }
    i += 1;
  }
  return out;
}

function isUsable(body: string): boolean {
  return !PLACEHOLDER.test(body) && !body.includes(BARRIER);
}

/**
 * Finds `close` starting at `from`, skipping escaped characters and requiring brace depth 0.
 * Returns -1 when not found (incomplete formula, e.g. still streaming) or crossing a barrier.
 */
function findClose(text: string, from: number, close: string, allowNewline: boolean): number {
  let depth = 0;
  for (let j = from; j < text.length; j++) {
    const ch = text[j];
    if (ch === BARRIER) return -1;
    if (!allowNewline && ch === '\n') return -1;
    if (depth === 0 && text.startsWith(close, j)) return j;
    if (ch === '\\') {
      j++; // skip escaped char (\{ \} \$ \\ ...)
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
  }
  return -1;
}

/** Pandoc-style rules so that currency like "$5 and $10" is not treated as math. */
function findSingleDollarClose(text: string, from: number): number {
  const first = text[from];
  if (first === undefined || /\s/.test(first) || first === '$') return -1;
  let depth = 0;
  for (let j = from; j < text.length; j++) {
    const ch = text[j];
    if (ch === '\n' || ch === BARRIER) return -1;
    if (ch === '\\') {
      j++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    else if (ch === '$' && depth === 0) {
      // A bare "$" that cannot close ("$5 and $10", "$a$$", "$1$2") means this was not math:
      // give up instead of searching further, so currency never swallows later text.
      if (text[j + 1] === '$') return -1;
      if (/\s/.test(text[j - 1])) return -1;
      if (/[0-9]/.test(text[j + 1] ?? '')) return -1;
      return j;
    }
  }
  return -1;
}

/** Quick pre-check used by the DOM layer to skip blocks that cannot contain math. */
export function mayContainMath(text: string): boolean {
  return /\$|\\\(|\\\[|\\begin\{/.test(text);
}
