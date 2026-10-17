/**
 * MutationObserver wrapper with batching and self-mutation suppression.
 * See docs/design/chatgpt-dom.md ("防循环").
 */

const OWN_ATTR = /^data-alr-/;

function isOwnNode(n: Node): boolean {
  if (n.nodeType !== 1) return false;
  const el = n as Element;
  return el.tagName === 'ALR-MATH' || el.hasAttribute('data-alr-clone') || el.id === 'alr-mathjax-style';
}

/** Nodes MathJax may append temporarily (e.g. to measure text) are not page changes. */
function isTransient(n: Node): boolean {
  if (n.nodeType !== 1) return false;
  const tag = (n as Element).tagName;
  return tag === 'svg' || tag === 'SVG' || tag.startsWith('MJX-');
}

export interface BatchOptions {
  /** Quiet period before a batch is flushed. */
  debounceMs: number;
  /** Upper bound so continuous streaming still gets processed regularly. */
  maxWaitMs: number;
}

export class BatchedObserver {
  private mo: MutationObserver;
  private pending = new Set<Element>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private firstPendingAt = 0;
  private running = false;

  constructor(
    private readonly onBatch: (dirty: Set<Element>) => void,
    private readonly opts: BatchOptions = { debounceMs: 150, maxWaitMs: 700 },
  ) {
    this.mo = new MutationObserver((records) => this.collect(records));
  }

  start(target: Node = document.body) {
    if (this.running) return;
    this.running = true;
    this.mo.observe(target, { childList: true, subtree: true, characterData: true });
  }

  stop() {
    this.running = false;
    this.mo.disconnect();
    this.pending.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /**
   * Runs our own synchronous DOM writes. Page mutations queued before the write are kept;
   * the records produced by `fn` itself are discarded.
   */
  mutate<T>(fn: () => T): T {
    if (!this.running) return fn();
    this.collect(this.mo.takeRecords());
    try {
      return fn();
    } finally {
      this.mo.takeRecords();
    }
  }

  private collect(records: MutationRecord[]) {
    for (const r of records) {
      if (r.type === 'attributes' && r.attributeName && OWN_ATTR.test(r.attributeName)) continue;
      const target = r.target.nodeType === 1 ? (r.target as Element) : r.target.parentElement;
      if (!target || !target.isConnected) continue;
      if (target.closest('alr-math, [data-alr-clone]')) continue;
      if (r.type === 'childList') {
        const nodes = [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)];
        if (nodes.length && nodes.every((n) => isOwnNode(n) || (target === document.body && isTransient(n)))) continue;
        if (nodes.length && nodes.every((n) => n.nodeType === 3 && !(n as Text).data.trim()) && !target.closest('[data-alr-raw-hidden]')) continue;
      }
      this.pending.add(target);
    }
    if (this.pending.size) this.schedule();
  }

  private schedule() {
    const now = performance.now();
    if (!this.timer) this.firstPendingAt = now;
    if (this.timer) clearTimeout(this.timer);
    const wait = Math.max(0, Math.min(this.opts.debounceMs, this.opts.maxWaitMs - (now - this.firstPendingAt)));
    this.timer = setTimeout(() => this.flush(), wait);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.pending.size) return;
    const batch = this.pending;
    this.pending = new Set();
    this.onBatch(batch);
  }
}
