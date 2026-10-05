import type { HistoryStore } from '@falang/scheme';
import { getMonaco, isMonacoInstalled } from '@falang/typescript-scheme';

/** Who an Edit → Undo/Redo (or Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) should act on. */
export type TUndoTarget = 'monaco' | 'native' | 'scheme';

/** The slice of a DOM element `classifyUndoTarget` reads — keeps the decision unit-testable without a DOM. */
export interface IFocusedElementLike {
  readonly tagName?: string;
  readonly type?: string;
  readonly isContentEditable?: boolean;
  closest?(selector: string): unknown;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * `monaco`: focus is inside a Monaco editor (scheme block editing) — Monaco owns its own undo stack.
 * `native`: a text `<input>`/`<textarea>`/`contenteditable` (Lexical included) — the browser/editor handles it.
 * `scheme`: anything else (the canvas, body, buttons) — undo the active document's `HistoryStore`.
 */
export const classifyUndoTarget = (element: IFocusedElementLike | null): TUndoTarget => {
  if (!element) return 'scheme';
  if (element.closest?.('.monaco-editor')) return 'monaco';
  const tag = element.tagName?.toUpperCase();
  if (tag === 'TEXTAREA') return 'native';
  if (tag === 'INPUT') return NON_TEXT_INPUT_TYPES.has((element.type ?? 'text').toLowerCase()) ? 'scheme' : 'native';
  if (element.isContentEditable) return 'native';
  return 'scheme';
};

export interface IUndoKeyEventLike {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly defaultPrevented: boolean;
}

/** Maps a keydown to `'undo'`/`'redo'` for the platform's shortcut (Cmd+Z/Cmd+Shift+Z on macOS, Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y elsewhere), else `null`. */
export const matchUndoKey = (event: IUndoKeyEventLike, isMac: boolean): 'undo' | 'redo' | null => {
  if (event.defaultPrevented || event.altKey) return null;
  const mod = isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (!mod) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !isMac && !event.shiftKey) return 'redo';
  return null;
};

const runMonaco = (kind: 'undo' | 'redo'): boolean => {
  if (!isMonacoInstalled()) return false;
  const editor = getMonaco()
    .editor.getEditors()
    .find((candidate) => candidate.hasTextFocus());
  if (!editor) return false;
  editor.trigger('menu', kind, null);
  return true;
};

export interface IUndoRedoDeps {
  /** The active document's history, or `null` (no document open). */
  getHistory(): HistoryStore | null;
  /** Native menu click → renderer (`main` sends it; the menu items do not register their accelerators). */
  onMenuUndo(listener: () => void): () => void;
  onMenuRedo(listener: () => void): () => void;
  readonly isMac?: boolean;
}

/**
 * Routes Edit → Undo/Redo, and the same shortcuts when focus is on the scheme canvas.
 *
 * One keypress = exactly one undo: the menu items are declared with `registerAccelerator: false`, so a keystroke is never
 * also fired as a menu click — it reaches the page only. A text control (native input, Lexical, Monaco) handles its own
 * Ctrl+Z and this module's `keydown` listener stays out of its way (`classifyUndoTarget` ≠ `scheme`); only a keystroke
 * that lands on the canvas is taken over (and `preventDefault`ed) here. A menu *click* has no keystroke, so it picks the
 * target from the focused element: Monaco → its own `undo` action, native text → `execCommand`, otherwise the history.
 */
export const installUndoRedo = (deps: IUndoRedoDeps): (() => void) => {
  const isMac = deps.isMac ?? /mac/i.test(globalThis.navigator?.platform ?? '');

  const runOnScheme = (kind: 'undo' | 'redo'): void => {
    const history = deps.getHistory();
    if (!history) return;
    if (kind === 'undo') history.back();
    else history.forward();
  };

  const fromMenu = (kind: 'undo' | 'redo'): void => {
    const target = classifyUndoTarget(document.activeElement as IFocusedElementLike | null);
    if (target === 'monaco') {
      if (!runMonaco(kind)) document.execCommand(kind);
    } else if (target === 'native') {
      document.execCommand(kind);
    } else {
      runOnScheme(kind);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const kind = matchUndoKey(event, isMac);
    if (!kind) return;
    if (classifyUndoTarget(document.activeElement as IFocusedElementLike | null) !== 'scheme') return;
    event.preventDefault();
    runOnScheme(kind);
  };

  globalThis.addEventListener('keydown', onKeyDown);
  const offUndo = deps.onMenuUndo(() => fromMenu('undo'));
  const offRedo = deps.onMenuRedo(() => fromMenu('redo'));
  return () => {
    globalThis.removeEventListener('keydown', onKeyDown);
    offUndo();
    offRedo();
  };
};
