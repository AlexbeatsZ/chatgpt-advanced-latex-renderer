/** Messages between popup and content script (chrome.tabs.sendMessage). */

export interface FormulaError {
  tex: string;
  message: string;
  source: 'katex' | 'text';
  time: number;
}

export interface Status {
  engine: 'idle' | 'loading' | 'ready' | 'error';
  engineError?: string;
  mathjaxVersion?: string;
  enabled: boolean;
  mode: string;
  counts: {
    katexSeen: number; // KaTeX formulas found on the page
    upgraded: number; // KaTeX formulas currently replaced by MathJax
    rawRendered: number; // formulas rendered from raw text
    errors: number;
    noSource: number; // rendered formulas whose TeX source could not be recovered
  };
  lastPassMs: number;
  errors: FormulaError[];
  macroErrors: string[];
}

export type Request =
  | { type: 'alr:status' }
  | { type: 'alr:rerender' }
  | { type: 'alr:validate-macros'; text: string };

export type ValidateResult = { ok: boolean; errors: string[] };
