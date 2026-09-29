/**
 * Real, per-project-type `falang.json` `type` strings this app writes for a *new* project, and the
 * document types/default document each one gets — see ADR 0005 (private)'s
 * "Implementation notes (project types, new-project dialog, single default document — 2026-09-20)".
 *
 * These match what `@falang/desktop-project-converter`'s `convertProjectType` already produces for a
 * migrated pre-monorepo project (`console_cpp` → `simple-code-cpp`, etc. — see that package's
 * `convert-project.ts`), i.e. one `simple-code-<language>` type per language, same as the old app's
 * five separate `console_*` project types.
 *
 * Plain TS only (no node/electron/react imports) — this file is imported from both `main` (the
 * `project:suggest-new-location` IPC handler) and the renderer (the new-project dialog, and
 * `DesktopProjectStore`'s per-project-type document filter). A *value* import from a node-only
 * package (e.g. `@falang/desktop-project-fs`'s main barrel) breaks electron-vite's renderer dev
 * server — see the repo's memory notes on this — so this module deliberately has zero dependencies.
 */

export interface IProjectTypeDefaultDocument {
  readonly type: string;
  readonly name: string;
}

export interface IProjectTypeConfig {
  /** Document types a project of this type may create — filters the project tree's "+" buttons and folder context menu. */
  readonly documentTypes: readonly string[];
  /** Created once, automatically, right after `project:create` — see `project-actions.ts`'s `createNewProject`. */
  readonly defaultDocument: IProjectTypeDefaultDocument;
  /** `desktop-app-sketch:project-type.<key>` — see `locales/en.json`/`ru.json`. */
  readonly labelKey: string;
}

export const PROJECT_TYPES = {
  text: {
    // Same three document kinds the old app's `TextProjectType` offered (`function`/`lifegram`/`tree`):
    // `text-function` is the text domain's own single-function document, `contour` the old `lifegram`.
    documentTypes: ['text-function', 'contour', 'mind-tree'],
    defaultDocument: { name: 'Main', type: 'contour' },
    labelKey: 'text',
  },
  logic: {
    documentTypes: ['function', 'objects-structure', 'enum-structure', 'external-api-structure'],
    defaultDocument: { name: 'Main', type: 'function' },
    labelKey: 'logic',
  },
  'simple-code-cpp': {
    documentTypes: ['simple-code-cpp'],
    defaultDocument: { name: 'Main', type: 'simple-code-cpp' },
    labelKey: 'simple-code-cpp',
  },
  'simple-code-js': {
    documentTypes: ['simple-code-js'],
    defaultDocument: { name: 'Main', type: 'simple-code-js' },
    labelKey: 'simple-code-js',
  },
  'simple-code-ts': {
    documentTypes: ['simple-code-ts'],
    defaultDocument: { name: 'Main', type: 'simple-code-ts' },
    labelKey: 'simple-code-ts',
  },
  'simple-code-php': {
    documentTypes: ['simple-code-php'],
    defaultDocument: { name: 'Main', type: 'simple-code-php' },
    labelKey: 'simple-code-php',
  },
  'simple-code-rust': {
    documentTypes: ['simple-code-rust'],
    defaultDocument: { name: 'Main', type: 'simple-code-rust' },
    labelKey: 'simple-code-rust',
  },
} as const satisfies Record<string, IProjectTypeConfig>;

export type TProjectType = keyof typeof PROJECT_TYPES;

export const PROJECT_TYPE_ORDER: readonly TProjectType[] = [
  'text',
  'logic',
  'simple-code-cpp',
  'simple-code-js',
  'simple-code-ts',
  'simple-code-php',
  'simple-code-rust',
];

export const isProjectType = (value: string): value is TProjectType => Object.hasOwn(PROJECT_TYPES, value);

/** Document types allowed for `projectType` — every known `DocumentType` for an unknown/legacy project `type` (soft fallback, see the ADR notes above), since a project created before this feature existed (or a converted one whose manifest `type` wasn't recognized) must keep offering everything it always did. */
export const allowedDocumentTypesFor = (
  projectType: string,
  everyDocumentType: readonly string[],
): readonly string[] => (isProjectType(projectType) ? PROJECT_TYPES[projectType].documentTypes : everyDocumentType);
