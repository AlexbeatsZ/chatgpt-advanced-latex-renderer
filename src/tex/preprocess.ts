/**
 * Source-level conflict resolution applied before MathJax parses the TeX.
 * See docs/design/macro-conflicts.md. Every rewrite is opt-in by syntax shape only:
 * input that does not match the specific pattern is passed through unchanged.
 */
import { readGroup, readOptional, skipSpaces, splitTopLevel } from './braces';

export interface PreprocessOptions {
  smartBraket: boolean;
  siunitx: boolean;
  /** Command names defined by the user; their source is never rewritten. */
  exclude?: ReadonlySet<string>;
}

export function preprocessTex(tex: string, opts: PreprocessOptions = { smartBraket: true, siunitx: true }): string {
  let out = tex;
  const ex = opts.exclude ?? new Set<string>();
  if (opts.siunitx) out = rewriteSiunitx(out, ex);
  if (opts.smartBraket && !ex.has('braket')) out = rewriteBraket(out);
  return out;
}

/* ------------------------------------------------------------------ braket */

/**
 * braket package: \braket{a|b}, \braket{a|H|b} (bars inside one argument).
 * physics package: \braket{a}{b}, \braket{a} (= <a|a>).
 * MathJax loads physics, so the braket-style single-argument form with top-level bars
 * is rewritten to the equivalent physics form instead of rendering <a|b|a|b>.
 */
export function rewriteBraket(tex: string): string {
  let out = '';
  let i = 0;
  const re = /\\braket(?![a-zA-Z])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tex))) {
    if (isEscaped(tex, m.index)) continue;
    let j = m.index + m[0].length;
    let star = '';
    if (tex[j] === '*') {
      star = '*';
      j++;
    }
    const a = readGroup(tex, skipSpaces(tex, j));
    if (!a) continue;
    const after = skipSpaces(tex, a.end);
    if (tex[after] === '{') continue; // physics two-argument form
    const parts = splitBars(a.content);
    let repl: string | null = null;
    if (parts.length === 2) repl = `\\braket${star}{${parts[0]}}{${parts[1]}}`;
    else if (parts.length === 3) repl = `\\mel${star}{${parts[0]}}{${parts[1]}}{${parts[2]}}`;
    if (repl === null) continue;
    out += tex.slice(i, m.index) + repl;
    i = a.end;
    re.lastIndex = a.end;
  }
  return out + tex.slice(i);
}

/** Splits on top-level "|" (not "\|", not "\vert", not inside braces). */
function splitBars(s: string): string[] {
  return splitTopLevel(s, '|');
}

function isEscaped(s: string, i: number): boolean {
  let k = i - 1;
  let n = 0;
  while (k >= 0 && s[k] === '\\') {
    n++;
    k--;
  }
  return n % 2 === 1;
}

/* ----------------------------------------------------------------- siunitx */

const PREFIX: Record<string, string> = {
  quecto: 'q', ronto: 'r', yocto: 'y', zepto: 'z', atto: 'a', femto: 'f', pico: 'p', nano: 'n',
  micro: 'μ', milli: 'm', centi: 'c', deci: 'd', deca: 'da', deka: 'da', hecto: 'h', kilo: 'k',
  mega: 'M', giga: 'G', tera: 'T', peta: 'P', exa: 'E', zetta: 'Z', yotta: 'Y',
};

const UNIT: Record<string, string> = {
  metre: 'm', meter: 'm', gram: 'g', kilogram: 'kg', second: 's', ampere: 'A', kelvin: 'K',
  mole: 'mol', candela: 'cd', hertz: 'Hz', newton: 'N', pascal: 'Pa', joule: 'J', watt: 'W',
  coulomb: 'C', volt: 'V', farad: 'F', ohm: 'Ω', siemens: 'S', weber: 'Wb', tesla: 'T',
  henry: 'H', degreeCelsius: '{}^\\circ\\mathrm{C}', lumen: 'lm', lux: 'lx', becquerel: 'Bq',
  gray: 'Gy', sievert: 'Sv', katal: 'kat', litre: 'L', liter: 'L', minute: 'min', hour: 'h',
  day: 'd', electronvolt: 'eV', dalton: 'Da', bar: 'bar', angstrom: 'Å', atmosphere: 'atm',
  atm: 'atm', torr: 'Torr', mmHg: 'mmHg', percent: '\\%', degree: '{}^\\circ', calorie: 'cal',
  barn: 'b', molar: 'M', astronomicalunit: 'au', hectare: 'ha', tonne: 't', bel: 'B', decibel: 'dB',
  neper: 'Np', arcminute: "'", arcsecond: "''", hartree: 'E_h', bohr: 'a_0', debye: 'D', psi: 'psi',
};

/**
 * Minimal siunitx subset: \qty{n}{u} (only when n is numeric and a second group follows),
 * \SI{n}{u}, \si{u}, \unit{u}, \num{n}. Physics \qty(...) / \qty{...} keep physics semantics.
 */
export function rewriteSiunitx(tex: string, exclude: ReadonlySet<string> = new Set()): string {
  const re = /\\(qty|SI|si|unit|num|ang)(?![a-zA-Z])/g;
  let out = '';
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tex))) {
    if (isEscaped(tex, m.index)) continue;
    const name = m[1];
    if (exclude.has(name)) continue;
    let j = skipSpaces(tex, m.index + m[0].length);
    const opt = readOptional(tex, j);
    if (opt) j = skipSpaces(tex, opt.end);
    let repl: string | null = null;
    let end = j;
    if (name === 'qty' || name === 'SI') {
      const a = readGroup(tex, j);
      if (!a) continue;
      const k = skipSpaces(tex, a.end);
      const b = readGroup(tex, k);
      if (!b) continue; // \qty{x} alone -> physics
      if (name === 'qty' && !isNumeric(a.content)) continue; // \qty{\frac ab}{...} -> physics
      repl = `${formatNumber(a.content)}\\,${formatUnit(b.content)}`;
      end = b.end;
    } else if (name === 'si' || name === 'unit') {
      const a = readGroup(tex, j);
      if (!a || !looksLikeUnit(a.content)) continue;
      repl = formatUnit(a.content);
      end = a.end;
    } else if (name === 'num') {
      const a = readGroup(tex, j);
      if (!a || !isNumeric(a.content)) continue;
      repl = formatNumber(a.content);
      end = a.end;
    } else if (name === 'ang') {
      const a = readGroup(tex, j);
      if (!a || !/^[\d.;\s+-]+$/.test(a.content)) continue;
      const [d, mi, se] = a.content.split(';').map((x) => x.trim());
      repl = [d && `${d}^{\\circ}`, mi && `${mi}'`, se && `${se}''`].filter(Boolean).join('\\,');
      end = a.end;
    }
    if (repl === null) continue;
    out += tex.slice(i, m.index) + `{${repl}}`;
    i = end;
    re.lastIndex = end;
  }
  return out + tex.slice(i);
}

const NUMERIC = /^\s*[+-]?(\+-|\\pm)?\s*(\d[\d\s,.]*|\.\d+)(\s*(\+-|\\pm)\s*[\d.]+)?(\s*\(\d+\))?\s*([eE]\s*[+-]?\d+)?\s*$/;

export function isNumeric(s: string): boolean {
  return NUMERIC.test(s) || /^\s*[+-]?\d+(\.\d+)?\s*(x|\\times)\s*10\^\{?[+-]?\d+\}?\s*$/.test(s);
}

export function formatNumber(s: string): string {
  let t = s.trim().replace(/\s+/g, '');
  t = t.replace(/\+-/g, '\\pm ');
  const e = /^(.*?)[eE]([+-]?\d+)$/.exec(t);
  if (e) t = `${e[1]}\\times 10^{${e[2].replace(/^\+/, '')}}`;
  t = t.replace(/(\d)x10\^/, '$1\\times 10^');
  return t;
}

function looksLikeUnit(s: string): boolean {
  return /^[\s\\a-zA-Zμ.~/^{}0-9+\-()%°Å]*$/.test(s);
}

export function formatUnit(s: string): string {
  const src = s.trim();
  if (!src.includes('\\')) return literalUnit(src);
  // Macro form: \kilo\joule\per\mole, \square\metre, \metre\squared, \tothe{3}
  const tokens = src.match(/\\[a-zA-Z]+|\{[^{}]*\}|[^\s\\{}]+/g) ?? [];
  const parts: { text: string; exp: number }[] = [];
  let prefix = '';
  let per = false;
  let pre: number | null = null;
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    const name = t.startsWith('\\') ? t.slice(1) : null;
    if (name === 'per') {
      per = true;
    } else if (name === 'square') pre = 2;
    else if (name === 'cubic') pre = 3;
    else if (name === 'squared' || name === 'cubed') {
      const last = parts[parts.length - 1];
      if (last) last.exp *= name === 'squared' ? 2 : 3;
    } else if (name === 'tothe' || name === 'raiseto') {
      const g = tokens[k + 1]?.replace(/[{}]/g, '');
      k++;
      const n = Number(g);
      if (name === 'raiseto') pre = n;
      else {
        const last = parts[parts.length - 1];
        if (last && Number.isFinite(n)) last.exp *= n;
      }
    } else if (name && name in PREFIX) prefix += PREFIX[name];
    else if (name && name in UNIT) {
      const exp = (pre ?? 1) * (per ? -1 : 1);
      parts.push({ text: prefix + UNIT[name], exp });
      prefix = '';
      per = false;
      pre = null;
    } else {
      // Unknown token: keep it verbatim (literal units mixed in).
      parts.push({ text: name ? t : t, exp: per ? -1 : 1 });
      per = false;
    }
  }
  return parts
    .map((p) => {
      const body = p.text.startsWith('{}') || p.text.startsWith('\\') ? p.text : `\\mathrm{${p.text}}`;
      return p.exp === 1 ? body : `${body}^{${p.exp}}`;
    })
    .join('\\,');
}

function literalUnit(s: string): string {
  // kJ.mol^-1, kJ~mol^{-1}, kJ mol-1, J/(mol K)
  const t = s
    .replace(/\^\s*([+-]?\d+)/g, '^{$1}')
    .replace(/([a-zA-Zμ])(-\d+)(?![\d}])/g, '$1^{$2}')
    .replace(/\s*[.~]\s*|\s+/g, '\\,');
  return `\\mathrm{${t}}`;
}
