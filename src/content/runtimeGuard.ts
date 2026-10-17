/**
 * The extension and the userscript run in different isolated worlds and cannot see each other's
 * globals, but they share the DOM. The first one to start claims the page with an attribute on
 * <html>; the other stays idle so formulas are never processed twice.
 */
export type Runtime = 'extension' | 'userscript';

const ATTR = 'data-alr-runtime';

export function claimPage(kind: Runtime): { ok: true } | { ok: false; owner: string } {
  const root = document.documentElement;
  const owner = root.getAttribute(ATTR);
  if (owner && owner !== kind) return { ok: false, owner };
  root.setAttribute(ATTR, kind);
  return { ok: true };
}
