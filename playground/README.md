# playground

Vite + React harness for manually exercising the scheme editor libraries (`npm run dev -w playground`).

The toolbar at the top:

- **Base icon** — the document's root kind: `function`, `contour` (the text domain's `functionalSchemeFactory`) or
  `mind-tree` (`mindTreeSchemeFactory`). Switching builds a fresh scheme; **Reset** rebuilds the current one.
- **Theme** — Default, Dark (the workflow client's palette) or Paper (the print export's: white, no grid). The antd
  chrome follows with its dark algorithm.
- **Debugger** — shows/hides the debug panel on the right. The session is driven by `FakeDebugAdapter`, which
  "executes" every statement icon in visual order (ADR 0021 (private)).
- **JSON** — the full document as `getDto` serializes it, live while open, with a Copy button.
- **Undo / Redo**, **Run agent** (a scripted LLM that inserts and edits two nodes, ADR 0009 (private)), **Log scheme**.

The base icon, theme and debugger toggle persist in `localStorage` (`falang:playground`). `globalThis.__playground`
exposes `{ store, scheme, session }` for the browser console or a Playwright script.

Files: `playground-store.ts` (state), `playground-scheme.tsx` (scheme and debug session factories), `toolbar.tsx`,
`json-modal.tsx`, `themes.ts`, `agent-demo.ts`.
