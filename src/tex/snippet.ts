/**
 * Splits the content of a ```latex code block into display formulas.
 * - `%` comments are removed;
 * - if the snippet uses math delimiters ($$, \[, \(, $), only the delimited parts are formulas;
 * - otherwise blank lines separate formulas, but never inside an open group or environment.
 */
import { stripComments } from './braces';
import { findMath, mayContainMath } from './delimiters';

export function splitLatexSnippet(src: string): string[] {
  const text = stripComments(src);
  if (mayContainMath(text)) {
    const segs = findMath(text).filter((s) => s.delim !== 'env');
    if (segs.length) return segs.map((s) => s.tex);
  }
  const out: string[] = [];
  let cur: string[] = [];
  let depth = 0;
  let envs = 0;
  const flush = () => {
    const t = cur.join('\n').trim();
    if (t) out.push(t);
    cur = [];
  };
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      if (depth <= 0 && envs <= 0) flush();
      else cur.push(line);
      continue;
    }
    cur.push(line);
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '\\') {
        if (line.startsWith('\\begin{', i)) envs++;
        else if (line.startsWith('\\end{', i)) envs--;
        i++;
      } else if (c === '{') depth++;
      else if (c === '}') depth--;
    }
  }
  flush();
  return out;
}
