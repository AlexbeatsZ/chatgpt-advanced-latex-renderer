// Read-only probe of the extraction layer, injected into a REAL chatgpt.com tab (via DevTools or
// an automation tool) to check DOM compatibility without installing the extension.
// It never modifies the page.
import { detectFailure, findRenderedUnits, getTexSource, isDisplayUnit } from '../../src/dom/katex';
import { authorOf, messageRoots } from '../../src/dom/scope';
import { findRawUnits, scanUnit } from '../../src/dom/rawText';
import { DEFAULT_SCAN } from '../../src/tex/delimiters';

export function run() {
  const roots = messageRoots(document.body, true);
  const units = findRenderedUnits(document);
  const failed = units.filter((u) => detectFailure(u).failed);
  const cmds: Record<string, number> = {};
  for (const u of failed) for (const c of detectFailure(u).commands) cmds[c] = (cmds[c] ?? 0) + 1;
  const assistantRoots = roots.filter((r) => authorOf(r) === 'assistant');
  const raw = assistantRoots.flatMap((r) => findRawUnits(r)).flatMap((u) => scanUnit(u, DEFAULT_SCAN).flatMap((s) => s.segments.map((m) => m.tex)));
  return {
    roots: { assistant: assistantRoots.length, user: roots.length - assistantRoots.length },
    units: units.length,
    display: units.filter(isDisplayUnit).length,
    withSource: units.filter((u) => getTexSource(u) !== null).length,
    failed: failed.length,
    failedCommands: cmds,
    unitsOutsideMessages: units.filter((u) => !u.closest('[data-content-search-unit-key],[data-message-author-role]')).length,
    rawSegments: raw.length,
    rawSample: raw.slice(0, 15),
    codeEditors: document.querySelectorAll('.cm-editor').length,
  };
}
