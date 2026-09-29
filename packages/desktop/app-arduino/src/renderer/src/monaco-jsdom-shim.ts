/**
 * `@falang/typescript-scheme`'s blocks import `monaco-editor` eagerly at module top level (not
 * lazily), and `monaco-editor`'s own `editor.main` bundle reaches for several browser APIs jsdom
 * doesn't implement, at *import* time — before any test hook gets a chance to run. Importing this
 * module first (ESM evaluates a synchronous import's whole subtree before moving on to the next
 * sibling import) installs bare-minimum stubs before that chain loads. Mirrors
 * `@falang/desktop-app-sketch`'s own `monaco-jsdom-shim.ts` (same gotcha, same fix — this app's
 * `arduino-scheme-factory.ts` reuses `@falang/typescript-scheme`'s `function` document editor).
 */
if (typeof document !== 'undefined') {
  const doc = document as Document & {
    queryCommandSupported?: (command: string) => boolean;
    queryCommandState?: (command: string) => boolean;
  };
  doc.queryCommandSupported ??= () => false;
  doc.queryCommandState ??= () => false;
}

// `in` rather than a direct `undefined` comparison — oxlint's `no-undefined`/`no-typeof-undefined`
// combo rules out comparing against `undefined` in any form.
if (!('matchMedia' in globalThis)) {
  globalThis.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => false,
    removeListener: () => false,
    addEventListener: () => false,
    removeEventListener: () => false,
    dispatchEvent: () => false,
  })) as unknown as typeof globalThis.matchMedia;
}

if (!('ResizeObserver' in globalThis)) {
  // No-op: jsdom has no real layout to observe.
  class FakeResizeObserver {
    observe(): boolean {
      return false;
    }
    unobserve(): boolean {
      return false;
    }
    disconnect(): boolean {
      return false;
    }
  }
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
}
