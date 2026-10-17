/**
 * The physics package redefines standard LaTeX commands:
 * - \sin \cos \ln \log \exp \det \Pr ... take an optional "[n]" POWER argument and auto-sized
 *   parentheses, so the very common chemistry notation \ln[\ce{A}] renders as ln^A;
 * - \div becomes the divergence, \Re / \Im become operators.
 * This package restores the base (standard LaTeX) definitions. Priority 4: above physics (5),
 * below user macros (configmacros, 3). Loaded unless the user opts into physics semantics.
 * physics-only names (\asin, \csch, \tr, \erf, ...) and the long forms (\sine, \logarithm,
 * \divergence, ...) are untouched.
 */
import { Configuration } from '@mathjax/src/mjs/input/tex/Configuration.js';
import { CharacterMap, CommandMap } from '@mathjax/src/mjs/input/tex/TokenMap.js';
import BaseMethods from '@mathjax/src/mjs/input/tex/base/BaseMethods.js';
import ParseMethods from '@mathjax/src/mjs/input/tex/ParseMethods.js';
import { TexConstant } from '@mathjax/src/mjs/input/tex/TexConstants.js';

/** Standard LaTeX function names that physics redefines (all NamedFn in base). */
export const STANDARD_FUNCTIONS = [
  'sin', 'sinh', 'arcsin', 'cos', 'cosh', 'arccos', 'tan', 'tanh', 'arctan',
  'csc', 'sec', 'cot', 'coth', 'exp', 'log', 'ln',
];

new CommandMap('alr-standard-fn', {
  ...Object.fromEntries(STANDARD_FUNCTIONS.map((n) => [n, BaseMethods.NamedFn])),
  det: BaseMethods.NamedOp,
  Pr: BaseMethods.NamedOp,
});
// (casts: the published typings of mathchar0mi/mo are narrower than CharacterMap's parameter type)
new CharacterMap('alr-standard-mi', ParseMethods.mathchar0mi as any, {
  Re: ['ℜ', { mathvariant: TexConstant.Variant.NORMAL }],
  Im: ['ℑ', { mathvariant: TexConstant.Variant.NORMAL }],
});
new CharacterMap('alr-standard-mo', ParseMethods.mathchar0mo as any, {
  div: '÷',
});

export const StandardFnsConfiguration = Configuration.create('alrstandard', {
  handler: { macro: ['alr-standard-fn', 'alr-standard-mi', 'alr-standard-mo'] },
  priority: 4,
} as any);
