/**
 * Raw (unrendered) LaTeX in page text, rendered IN PLACE without breaking React:
 * page nodes are never moved, removed or split. We only change the `data` of page text
 * nodes (remembering the original) and insert our own nodes (<alr-math>, <alr-text>) next
 * to them. Every change is recorded so it can be undone exactly.
 * See docs/design/chatgpt-dom.md ("原文公式：原位替换").
 */
import { BARRIER, findMath, mayContainMath, type MathSegment, type ScanOptions } from '../tex/delimiters';
import { EXCLUDED_SELECTOR } from './scope';

export const BLOCK_SELECTOR = 'p, li, td, th, h1, h2, h3, h4, h5, h6, dd, dt, blockquote, figcaption, summary, label';

/** Our nodes created by raw-text rendering. They are invisible to text collection. */
export const RAW_OWN_SELECTOR = 'alr-math[data-alr-src="text"], alr-text';

interface Piece {
  node: Text;
  start: number;
  /** text the page intends this node to have (original data while we hold it modified) */
  data: string;
}

export interface TextMap {
  text: string;
  pieces: Piece[];
}

interface Touch {
  original: string;
  applied: string;
}

/** What we changed in one block. */
export interface BlockState {
  touches: Map<Text, Touch>;
  inserted: Node[];
  hidden: Element[];
  /** the page text (as the page intends it) we rendered */
  text: string;
}

const states = new WeakMap<Element, BlockState>();
const processed = new Set<Element>();

export function stateOf(block: Element): BlockState | undefined {
  return states.get(block);
}

/** Page-intended data of a text node: the original if we modified it and nobody changed it since. */
function pageData(t: Text): string {
  for (let el = t.parentElement; el; el = el.parentElement) {
    const st = states.get(el);
    if (st) {
      const touch = st.touches.get(t);
      if (touch) return t.data === touch.applied ? touch.original : t.data;
    }
  }
  return t.data;
}

/**
 * Text of `block` as the page intends it: our own nodes are skipped, modified text nodes
 * report their original data, nested blocks and excluded regions become BARRIERs.
 */
export function collectText(block: Element): TextMap {
  let text = '';
  const pieces: Piece[] = [];
  const walk = (el: Element) => {
    for (let n = el.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        const t = n as Text;
        const data = pageData(t);
        pieces.push({ node: t, start: text.length, data });
        text += data;
      } else if (n.nodeType === 1) {
        const e = n as Element;
        if (e.matches(RAW_OWN_SELECTOR)) continue;
        if (e.tagName === 'BR') text += '\n'; // also when we hid it inside a multi-line formula
        else if (e.hasAttribute('data-alr-hidden')) continue; // upgraded formula: its <alr-math> sibling is the barrier
        else if (e.matches(EXCLUDED_SELECTOR) || e.matches(BLOCK_SELECTOR)) text += BARRIER;
        else walk(e);
      }
    }
  };
  walk(block);
  return { text, pieces };
}

/** The block whose text a node belongs to: nearest block element inside `root`, else nearest div. */
export function blockFor(el: Element, root: Element): Element | null {
  const b = el.closest(BLOCK_SELECTOR);
  if (b && root.contains(b)) return b;
  const div = el.closest('div');
  return div && (root.contains(div) || div === root) ? div : null;
}

/** Candidate blocks under `root` that may contain raw math (or that we already processed). */
export function findRawBlocks(root: Element): Element[] {
  const blocks = new Set<Element>();
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const d = (n as Text).data;
      return d.includes('$') || d.includes('\\') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || parent.closest(EXCLUDED_SELECTOR)) continue;
    const block = blockFor(parent, root);
    if (block) blocks.add(block);
  }
  for (const b of processed) if (root.contains(b)) blocks.add(b);
  return [...blocks];
}

export function scanBlock(block: Element, opts: ScanOptions): { map: TextMap; segments: MathSegment[] } {
  const map = collectText(block);
  if (!mayContainMath(map.text)) return { map, segments: [] };
  return { map, segments: findMath(map.text, opts) };
}

/** DOM position for a string offset. `bias` picks the node after (start) or before (end) a boundary. */
export function positionAt(map: TextMap, offset: number, bias: 'start' | 'end'): { piece: Piece; offset: number } | null {
  for (const p of map.pieces) {
    const len = p.data.length;
    if (bias === 'start' ? offset >= p.start && offset < p.start + len : offset > p.start && offset <= p.start + len) {
      return { piece: p, offset: offset - p.start };
    }
  }
  return null;
}

/** Undo everything we changed in `block`. Text React changed meanwhile is left as React set it. */
export function restoreBlock(block: Element) {
  const st = states.get(block);
  if (!st) return;
  for (const [node, t] of st.touches) if (node.data === t.applied) node.data = t.original;
  for (const n of st.inserted) n.parentNode?.removeChild(n);
  for (const e of st.hidden) e.removeAttribute('data-alr-hidden');
  states.delete(block);
  processed.delete(block);
}

export function restoreAllBlocks() {
  for (const b of [...processed]) restoreBlock(b);
}

/** Forget blocks that left the document (their nodes went with them). */
export function forgetDetached() {
  for (const b of [...processed]) if (!b.isConnected) {
    states.delete(b);
    processed.delete(b);
  }
}

/**
 * Applies rendered segments to `block` in place. `expected` is the page text the segments were
 * computed from; if the block changed meanwhile nothing is applied. Returns false in that case.
 * Must be called inside the observer's mutate() wrapper.
 */
export function applyBlock(block: Element, expected: string, segments: MathSegment[], make: (s: MathSegment) => Node | null): boolean {
  restoreBlock(block);
  const map = collectText(block);
  if (map.text !== expected) return false;
  const st: BlockState = { touches: new Map(), inserted: [], hidden: [], text: expected };
  const setData = (node: Text, data: string) => {
    if (!st.touches.has(node)) st.touches.set(node, { original: node.data, applied: data });
    st.touches.get(node)!.applied = data;
    node.data = data;
  };
  const insertAfter = (ref: Node, n: Node) => {
    ref.parentNode!.insertBefore(n, ref.nextSibling);
    st.inserted.push(n);
  };
  const doc = block.ownerDocument;
  for (let k = segments.length - 1; k >= 0; k--) {
    const seg = segments[k];
    const a = positionAt(map, seg.start, 'start');
    const b = positionAt(map, seg.end, 'end');
    if (!a || !b) continue;
    const node = make(seg);
    if (!node) continue;
    const aNode = a.piece.node;
    const bNode = b.piece.node;
    if (aNode === bNode) {
      const cur = aNode.data; // may already be shortened by a later segment in the same node
      const suffix = cur.slice(b.offset);
      setData(aNode, cur.slice(0, a.offset));
      if (suffix) {
        const s = doc.createElement('alr-text');
        s.textContent = suffix;
        insertAfter(aNode, s);
      }
      insertAfter(aNode, node);
    } else {
      // Segment spans several page text nodes (e.g. per-word streaming spans).
      const ai = map.pieces.indexOf(a.piece);
      const bi = map.pieces.indexOf(b.piece);
      for (let i = ai + 1; i < bi; i++) setData(map.pieces[i].node, '');
      setData(bNode, bNode.data.slice(b.offset));
      setData(aNode, aNode.data.slice(0, a.offset));
      // <br> etc. inside a multi-line formula would leave visible gaps.
      const range = doc.createRange();
      range.setStartAfter(aNode);
      range.setEndBefore(bNode);
      const holder = range.commonAncestorContainer;
      const it = doc.createTreeWalker(holder, NodeFilter.SHOW_ELEMENT);
      for (let e = it.nextNode() as Element | null; e; e = it.nextNode() as Element | null) {
        if (e.tagName === 'BR' && range.intersectsNode(e) && !e.hasAttribute('data-alr-hidden')) {
          e.setAttribute('data-alr-hidden', '');
          st.hidden.push(e);
        }
      }
      insertAfter(aNode, node);
    }
  }
  if (st.touches.size || st.inserted.length) {
    states.set(block, st);
    processed.add(block);
  }
  return true;
}

/** True if we hold modifications for `block` and its page text is unchanged since. */
export function isUpToDate(block: Element): boolean {
  const st = states.get(block);
  if (!st) return false;
  for (const n of st.inserted) if (!n.isConnected) return false;
  for (const [node, t] of st.touches) if (!node.isConnected || node.data !== t.applied) return false;
  return collectText(block).text === st.text;
}
