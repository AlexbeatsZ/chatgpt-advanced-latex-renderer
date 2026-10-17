// Read-only probe of the extraction layer, injected into a REAL chatgpt.com tab (via DevTools or
// an automation tool) to check DOM compatibility and scan cost without installing the extension.
// It never modifies the page.
import { detectFailure, findPreviewErrors, findRenderedUnits, getTexSource, isDisplayUnit, usesPreferred } from '../../src/dom/katex';
import { authorOf, messageRoots } from '../../src/dom/scope';
import { findRawBlocks, scanBlock } from '../../src/dom/rawText';
import { DEFAULT_SCAN } from '../../src/tex/delimiters';

const PREFERRED = new Set(['ce', 'pu', 'bra', 'ket', 'braket']);

export function run() {
  const ms: Record<string, number> = {};
  const time = <T>(k: string, f: () => T): T => {
    const t0 = performance.now();
    const r = f();
    ms[k] = Math.round((performance.now() - t0) * 10) / 10;
    return r;
  };
  const roots = time('messageRoots', () => messageRoots(document.body, true));
  const units = time('findRenderedUnits', () => findRenderedUnits(document));
  const sources = time('getTexSource', () => units.map(getTexSource));
  const failures = time('detectFailure', () => units.map(detectFailure));
  const wanted = time('usesPreferred', () => units.filter((u, i) => failures[i].failed || usesPreferred(sources[i] ?? '', PREFERRED)));
  const assistantRoots = roots.filter((r) => authorOf(r) === 'assistant');
  const blocks = time('findRawBlocks', () => assistantRoots.flatMap((r) => findRawBlocks(r)));
  const raw = time('scanBlock', () => blocks.flatMap((b) => scanBlock(b, DEFAULT_SCAN).segments.map((m) => m.tex)));
  const cmds: Record<string, number> = {};
  failures.forEach((f) => f.commands.forEach((c) => (cmds[c] = (cmds[c] ?? 0) + 1)));
  return {
    roots: { assistant: assistantRoots.length, user: roots.length - assistantRoots.length },
    units: units.length,
    display: units.filter(isDisplayUnit).length,
    withSource: sources.filter((s) => s !== null).length,
    failed: failures.filter((f) => f.failed).length,
    failedCommands: cmds,
    wanted: wanted.length,
    previewErrors: findPreviewErrors(document).length,
    rawBlocks: blocks.length,
    rawSegments: raw.length,
    domElements: document.getElementsByTagName('*').length,
    ms,
  };
}
