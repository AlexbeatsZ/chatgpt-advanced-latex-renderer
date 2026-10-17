/**
 * Raw (unrendered) LaTeX in text: block discovery, text collection with barriers and
 * mapping string offsets back to DOM positions. Writes only ever happen on our own clone.
 */
import { BARRIER, findMath, mayContainMath, type MathSegment, type ScanOptions } from '../tex/delimiters';
import { EXCLUDED_SELECTOR } from './scope';

export const BLOCK_SELECTOR = 'p, li, td, th, h1, h2, h3, h4, h5, h6, dd, dt, blockquote, figcaption, summary';

interface Piece {
  node: Text;
  start: number;
}

export interface TextMap {
  text: string;
  pieces: Piece[];
}

/** Text of `block` excluding nested blocks and excluded regions (which become BARRIERs). */
export function collectText(block: Element): TextMap {
  let text = '';
  const pieces: Piece[] = [];
  const walk = (el: Element) => {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        const t = n as Text;
        pieces.push({ node: t, start: text.length });
        text += t.data;
      } else if (n.nodeType === 1) {
        const e = n as Element;
        if (e.tagName === 'BR') text += '\n';
        else if (e.hasAttribute('data-alr-hidden')) continue; // hidden original of an upgraded formula
        else if (e.matches(EXCLUDED_SELECTOR) || e.matches(BLOCK_SELECTOR)) text += BARRIER;
        else walk(e);
      }
    }
  };
  walk(block);
  return { text, pieces };
}

/**
 * The unit that gets hidden + cloned for a text node: the OUTERMOST block element inside
 * `root` (so a list item with nested paragraphs/lists is handled as one unit), or the
 * nearest div for text that is not inside any block element.
 */
export function rawUnitFor(el: Element, root: Element): Element | null {
  let unit: Element | null = el.closest(BLOCK_SELECTOR);
  if (unit && !root.contains(unit)) unit = null;
  if (unit) {
    for (let up = unit.parentElement?.closest(BLOCK_SELECTOR); up && root.contains(up); up = up.parentElement?.closest(BLOCK_SELECTOR)) {
      unit = up;
    }
    return unit;
  }
  const div = el.closest('div');
  return div && (root.contains(div) || div === root) ? div : null;
}

/** Candidate units under `root` that may contain raw math. Hidden originals are skipped. */
export function findRawUnits(root: Element): Element[] {
  const units = new Set<Element>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const d = (n as Text).data;
      return d.includes('$') || d.includes('\\') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || parent.closest(EXCLUDED_SELECTOR)) continue;
    const unit = rawUnitFor(parent, root);
    if (unit) units.add(unit);
  }
  return [...units];
}

export interface BlockScan {
  block: Element;
  map: TextMap;
  segments: MathSegment[];
}

/** Scans the unit and every nested block (each block's text excludes its nested blocks). */
export function scanUnit(unit: Element, opts: ScanOptions): BlockScan[] {
  const out: BlockScan[] = [];
  const blocks = [unit, ...Array.from(unit.querySelectorAll(BLOCK_SELECTOR))];
  for (const block of blocks) {
    const excluded = block === unit ? null : block.parentElement?.closest(EXCLUDED_SELECTOR);
    if (excluded && unit.contains(excluded)) continue; // e.g. a <p> inside a code widget
    const map = collectText(block);
    if (!mayContainMath(map.text)) continue;
    const segments = findMath(map.text, opts);
    if (segments.length) out.push({ block, map, segments });
  }
  return out;
}

/** DOM position for a string offset. `bias` picks the node after (start) or before (end) a boundary. */
export function positionAt(map: TextMap, offset: number, bias: 'start' | 'end'): { node: Text; offset: number } | null {
  const ps = map.pieces;
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k];
    const len = p.node.data.length;
    if (bias === 'start' ? offset >= p.start && offset < p.start + len : offset > p.start && offset <= p.start + len) {
      return { node: p.node, offset: offset - p.start };
    }
  }
  return null;
}

/**
 * Replaces each segment in a block we own (the clone) with the node produced by `make`.
 * Segments are processed back to front so earlier offsets stay valid.
 */
export function replaceSegments(map: TextMap, segments: MathSegment[], make: (s: MathSegment) => Node | null): number {
  let count = 0;
  for (let k = segments.length - 1; k >= 0; k--) {
    const seg = segments[k];
    const node = make(seg);
    if (!node) continue;
    const a = positionAt(map, seg.start, 'start');
    const b = positionAt(map, seg.end, 'end');
    if (!a || !b) continue;
    const doc = a.node.ownerDocument;
    const range = doc.createRange();
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
    range.deleteContents();
    range.insertNode(node);
    count++;
  }
  return count;
}

/** Signature used to detect changes of a hidden original unit (streaming, React re-render). */
export function unitSignature(unit: Element): string {
  const blocks = [unit, ...Array.from(unit.querySelectorAll(BLOCK_SELECTOR))];
  return blocks.map((b) => collectText(b).text).join('␞');
}
