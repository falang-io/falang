// oxlint-disable func-names
// oxlint-disable consistent-function-scoping
// oxlint-disable no-explicit-any
// oxlint-disable no-non-null-assertion
// oxlint-disable prefer-global-this
// oxlint-disable switch-case-braces
import type * as monaco from 'monaco-editor';
import { lib } from './lib.js';
import { libPortable } from './lib-portable.js';

type IDisposable = monaco.IDisposable;
type Environment = monaco.Environment;

/**
 * Monaco is host-installed: this module has no runtime dependency on `monaco-editor`, a bundler-specific
 * `?worker` import or CSS, so the package index stays importable in plain Node (headless scheme building).
 * A browser host calls `installMonaco` once at startup — in practice by importing
 * `@falang/typescript-scheme/src/browser.js`, which does it with the real `monaco-editor` package.
 */
export interface IInstallMonacoOptions {
  /** Creates the language-service worker (`MonacoEnvironment.getWorker`). */
  getWorker: () => Worker;
}

type TMonacoApi = typeof monaco;

let monacoNamespace: TMonacoApi | null = null;

export const installMonaco = (monacoApi: TMonacoApi, options: IInstallMonacoOptions): void => {
  monacoNamespace = monacoApi;
  (globalThis as unknown as { MonacoEnvironment: Environment }).MonacoEnvironment = {
    getWorker: options.getWorker,
  };
};

export const isMonacoInstalled = (): boolean => monacoNamespace !== null;

let initialized = false;
let overflowWidgetsDomNode: HTMLElement | null = null;

/** `'full'` (default) is `lib.ts` (real JS/TS surface); `'portable'` is `lib-portable.ts`, see its own top comment. */
export type TMonacoLibVariant = 'full' | 'portable';

const LIB_SOURCE_BY_VARIANT: Readonly<Record<TMonacoLibVariant, string>> = {
  full: lib,
  portable: libPortable,
};

let appliedLibVariant: TMonacoLibVariant | null = null;
let desiredLibVariant: TMonacoLibVariant = 'full';
let baseLibDisposable: IDisposable | null = null;

let appliedExtraDeclarations: string | null = null;
let desiredExtraDeclarations = '';
let hostExtraLibDisposable: IDisposable | null = null;

const applyLibVariant = (monaco: TMonacoApi): void => {
  if (appliedLibVariant !== desiredLibVariant) {
    baseLibDisposable?.dispose();
    baseLibDisposable = monaco.typescript.typescriptDefaults.addExtraLib(
      LIB_SOURCE_BY_VARIANT[desiredLibVariant],
      '@types/lib.d.ts',
    );
    appliedLibVariant = desiredLibVariant;
  }
  if (appliedExtraDeclarations !== desiredExtraDeclarations) {
    hostExtraLibDisposable?.dispose();
    hostExtraLibDisposable = desiredExtraDeclarations
      ? monaco.typescript.typescriptDefaults.addExtraLib(desiredExtraDeclarations, '@types/lib-host-extra.d.ts')
      : null;
    appliedExtraDeclarations = desiredExtraDeclarations;
  }
};

/**
 * Selects which lib variant every `'typescript'`-language monaco model type-checks against, plus an
 * optional `extraDeclarations` block of further `declare`s layered on top of it in a second extra lib
 * file — for host-specific ambient globals the shared `'full'`/`'portable'` surfaces don't know about
 * (e.g. `app-arduino`'s `digitalWrite`/`millis`/`Serial`/… from `ARDUINO_BUILTIN_DECLARATIONS`, kept
 * in sync with `@falang/logic-constructor`'s own `extraDeclarations` compile-time check by both sides
 * reading the same array). `monaco.typescript.typescriptDefaults` is one global instance for the whole
 * window, so this is a host-level choice, not a per-editor one — call it once per opened project,
 * before building any of its schemes/documents (see `DesktopProjectStore`'s and `ArduinoProjectStore`'s
 * constructors), not from inside a block/editor component. Safe to call again later (e.g. the user
 * opens a different project of a different type in the same window) — swaps the registered extra libs
 * in place.
 */
export const setMonacoLibVariant = (variant: TMonacoLibVariant, extraDeclarations = ''): void => {
  desiredLibVariant = variant;
  desiredExtraDeclarations = extraDeclarations;
  if (initialized && monacoNamespace) applyLibVariant(monacoNamespace);
};

const THEME_CLASSES = ['vs', 'vs-dark', 'hc-black', 'hc-light'];

/**
 * Host node for Monaco's suggest/hover/etc. widgets, appended directly to `document.body`.
 * The scheme canvas renders its content inside a `transform: scale(...)` container
 * (see transform-container.cmp.tsx); a CSS transform on an ancestor creates a new containing
 * block for `position: fixed` descendants, so Monaco's overflow widgets — normally fixed relative
 * to the viewport — would end up positioned (and scaled) relative to that transformed ancestor
 * instead, landing far from the cursor. Rendering them into a node outside the transform keeps
 * their `position: fixed` coordinates truly viewport-relative.
 *
 * Monaco's theming CSS is scoped under `.monaco-editor.<theme>` (e.g. `.monaco-editor.vs-dark`);
 * since this node lives outside any `.monaco-editor` element, those classes must be applied here
 * by hand or every widget renders unstyled (default black-on-transparent text).
 */
export const getOverflowWidgetsDomNode = (themeName: string): HTMLElement => {
  if (!overflowWidgetsDomNode) {
    overflowWidgetsDomNode = document.createElement('div');
    overflowWidgetsDomNode.classList.add('monaco-overflow-widgets-host', 'monaco-editor');
    document.body.append(overflowWidgetsDomNode);
  }
  overflowWidgetsDomNode.classList.remove(...THEME_CLASSES);
  overflowWidgetsDomNode.classList.add(themeName);
  return overflowWidgetsDomNode;
};

export const getMonaco = (): TMonacoApi => {
  const monaco = monacoNamespace;
  if (!monaco) {
    throw new Error(
      'Monaco is not installed. A browser host must import `@falang/typescript-scheme/src/browser.js` (or call ' +
        '`installMonaco`) once at startup, before any monaco-backed block is created.',
    );
  }
  if (!initialized) {
    monaco.typescript.typescriptDefaults.setCompilerOptions({
      moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      noLib: true,
      locale: 'ru',
      isolatedModules: true,
      strict: true,
      noImplicitAny: true,
      strictNullChecks: true,
      strictFunctionTypes: true,
      strictBindCallApply: true,
      strictPropertyInitialization: true,
      noImplicitThis: true,
      alwaysStrict: true,
    });
    monaco.typescript.typescriptDefaults.setEagerModelSync(true);
    initialized = true;
  }
  applyLibVariant(monaco);
  return monaco;
};
