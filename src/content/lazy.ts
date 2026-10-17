/**
 * Viewport-driven work queue. Formulas are rendered when they come within `margin` of the
 * visible area of their scroll container. ChatGPT scrolls messages inside an inner element; an
 * IntersectionObserver rooted at the viewport would have its rootMargin clipped by that
 * element (formulas would only switch once on screen), so one observer is used per scroll root.
 */
const OVERFLOWS = new Set(['auto', 'scroll', 'overlay']);

export class LazyQueue {
  private observers = new Map<Element | null, IntersectionObserver>();
  private rootCache = new WeakMap<Element, Element | null>();

  constructor(
    private readonly onVisible: (els: Element[]) => void,
    private readonly margin = '1200px 0px',
  ) {}

  observe(el: Element) {
    const root = this.scrollRootOf(el);
    let io = this.observers.get(root);
    if (!io) {
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target);
          for (const v of visible) io!.unobserve(v);
          if (visible.length) this.onVisible(visible);
        },
        { root, rootMargin: this.margin },
      );
      this.observers.set(root, io);
    }
    io.observe(el);
  }

  disconnect() {
    for (const io of this.observers.values()) io.disconnect();
    this.observers.clear();
    this.rootCache = new WeakMap();
  }

  /** Nearest scrollable ancestor (memoized along the chain), or null for the viewport. */
  private scrollRootOf(el: Element): Element | null {
    const chain: Element[] = [];
    let found: Element | null = null;
    for (let e = el.parentElement; e && e !== document.body && e !== document.documentElement; e = e.parentElement) {
      const cached = this.rootCache.get(e);
      if (cached !== undefined) {
        found = cached;
        break;
      }
      chain.push(e);
      if (OVERFLOWS.has(getComputedStyle(e).overflowY)) {
        found = e;
        break;
      }
    }
    for (const c of chain) this.rootCache.set(c, found);
    return found;
  }
}
