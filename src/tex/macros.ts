/**
 * Parses user macro definitions written in ordinary LaTeX syntax into the MathJax
 * `tex.macros` configuration format.
 *
 * Supported: \newcommand / \renewcommand / \providecommand (with [n] and [default]),
 * \DeclareMathOperator(*), \def\name#1#2{...}.
 */
import { readCommand, readGroup, readOptional, skipSpaces, stripComments } from './braces';

export type MacroDef = string | [string, number] | [string, number, string];
export type MacroMap = Record<string, MacroDef>;

export interface ParsedMacros {
  macros: MacroMap;
  errors: string[];
}

export function parseMacros(source: string): ParsedMacros {
  const s = stripComments(source);
  const macros: MacroMap = {};
  const errors: string[] = [];
  let i = 0;
  while (i < s.length) {
    i = skipSpaces(s, i);
    if (i >= s.length) break;
    const cmd = readCommand(s, i);
    if (!cmd) {
      errors.push(`无法识别的内容: "${s.slice(i, i + 30)}"`);
      i = nextLine(s, i);
      continue;
    }
    const lineStart = i;
    i = cmd.end;
    try {
      switch (cmd.name) {
        case 'newcommand':
        case 'renewcommand':
        case 'providecommand': {
          if (s[i] === '*') i++;
          i = skipSpaces(s, i);
          const name = readName(s, i);
          i = skipSpaces(s, name.end);
          let nargs = 0;
          let def: string | undefined;
          const n = readOptional(s, i);
          if (n) {
            nargs = parseInt(n.content, 10);
            if (!(nargs >= 0 && nargs <= 9)) throw new Error(`参数个数无效: [${n.content}]`);
            i = skipSpaces(s, n.end);
            const d = readOptional(s, i);
            if (d) {
              def = d.content;
              i = skipSpaces(s, d.end);
            }
          }
          const body = readGroup(s, i);
          if (!body) throw new Error(`\\${name.name} 缺少 {定义体}`);
          i = body.end;
          macros[name.name] = def !== undefined ? [body.content, nargs, def] : nargs ? [body.content, nargs] : body.content;
          break;
        }
        case 'DeclareMathOperator': {
          let star = false;
          if (s[i] === '*') {
            star = true;
            i++;
          }
          i = skipSpaces(s, i);
          const name = readName(s, i);
          i = skipSpaces(s, name.end);
          const body = readGroup(s, i);
          if (!body) throw new Error(`\\${name.name} 缺少 {算符文本}`);
          i = body.end;
          macros[name.name] = `\\operatorname${star ? '*' : ''}{${body.content}}`;
          break;
        }
        case 'def': {
          i = skipSpaces(s, i);
          const c = readCommand(s, i);
          if (!c) throw new Error('\\def 后缺少命令名');
          i = c.end;
          let nargs = 0;
          while (s[i] === '#' && /[1-9]/.test(s[i + 1] ?? '')) {
            nargs++;
            i += 2;
          }
          i = skipSpaces(s, i);
          const body = readGroup(s, i);
          if (!body) throw new Error(`\\${c.name} 缺少 {定义体}`);
          i = body.end;
          macros[c.name] = nargs ? [body.content, nargs] : body.content;
          break;
        }
        default:
          throw new Error(`不支持的定义命令 \\${cmd.name}（支持 \\newcommand、\\renewcommand、\\DeclareMathOperator、\\def）`);
      }
    } catch (e) {
      errors.push((e as Error).message);
      i = Math.max(nextLine(s, lineStart), i);
    }
  }
  return { macros, errors };
}

function readName(s: string, i: number): { name: string; end: number } {
  if (s[i] === '{') {
    const g = readGroup(s, i);
    const c = g && /^\s*\\([a-zA-Z@]+)\s*$/.exec(g.content);
    if (!g || !c) throw new Error(`命令名无效: ${s.slice(i, i + 20)}`);
    return { name: c[1], end: g.end };
  }
  const c = readCommand(s, i);
  if (!c || !/^[a-zA-Z@]+$/.test(c.name)) throw new Error(`命令名无效: ${s.slice(i, i + 20)}`);
  return { name: c.name, end: c.end };
}

function nextLine(s: string, i: number): number {
  const j = s.indexOf('\n', i);
  return j < 0 ? s.length : j + 1;
}

/** Defaults: only NEW names, never redefining standard LaTeX commands. */
export const DEFAULT_MACROS_TEXT = String.raw`% 自定义宏（LaTeX 语法，每行一个）。默认只新增命令名，不覆盖标准命令。
\newcommand{\vect}[1]{\boldsymbol{#1}}   % 向量：粗体
\newcommand{\mat}[1]{\mathbf{#1}}        % 矩阵：\mathbf
\newcommand{\diff}{\mathrm{d}}           % 微分 d
\newcommand{\ee}{\mathrm{e}}             % 自然常数 e
\newcommand{\ii}{\mathrm{i}}             % 虚数单位 i
`;
