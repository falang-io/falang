import type { DependencyContainer } from '@falang/di';
import { container } from '@falang/di';
import type { INode } from '@falang/dto';
import type { IModule, Scheme } from '@falang/scheme';
import { codeFunctionalSchemeFactory } from '@falang/simple-code-scheme';
import {
  CODE_LANGUAGE_LABELS,
  CODE_ROOT_NODE_NAME,
  type TCodeDocumentType,
  type TCodeLanguage,
} from '@falang/simple-code-dto';
import { functionalSchemeFactory, mindTreeSchemeFactory, registerProjectDocumentsRegistry } from '@falang/text-scheme';
import {
  enumStructureSchemeFactory,
  externalApiStructureSchemeFactory,
  functionalSchemeFactory as typescriptFunctionalSchemeFactory,
  objectsStructureSchemeFactory,
  registerTypescriptProjectService,
} from '@falang/typescript-scheme';
import { ENUM_STRUCTURE_NAME, EXTERNAL_API_STRUCTURE_NAME } from '@falang/typescript-dto';

export type SketchDocumentType =
  | 'contour'
  | 'text-function'
  | 'mind-tree'
  | 'function'
  | 'objects-structure'
  | 'enum-structure'
  | 'external-api-structure'
  | TCodeDocumentType;

export interface ISketchDocumentTypeConfig {
  label: string;
  rootNodeName: string;
  buildScheme: (params: {
    id: string;
    name: string;
    parentContainer: DependencyContainer;
    extraModules?: IModule[];
    /** Version diff view (ADR 0025 (private)) — a read-only scheme. */
    readOnly?: boolean;
  }) => Scheme;
}

/** Language is baked in per `DocumentType` — `buildScheme` has no slot for extra params, so the
 * `simple-code` domain gets one desktop document type per language, same as the old app's 5 separate
 * `console_*` project types. */
const codeDocumentTypeConfig = (language: TCodeLanguage): ISketchDocumentTypeConfig => ({
  label: `Code (${CODE_LANGUAGE_LABELS[language]})`,
  rootNodeName: CODE_ROOT_NODE_NAME,
  buildScheme: (params) => codeFunctionalSchemeFactory({ ...params, language }),
});

/** `app-sketch`'s document types: label, root node kind and the scheme factory of each. */
export const SKETCH_DOCUMENT_TYPES: Record<SketchDocumentType, ISketchDocumentTypeConfig> = {
  contour: {
    label: 'Contour',
    rootNodeName: 'contour',
    buildScheme: (params) => functionalSchemeFactory(params),
  },
  /** The text domain's own single-function document (the old app's `text`-project `function` root — see
   * ADR 0005 (private)'s "Implementation notes (text-domain `function` document …)"),
   * rendered by the same text `functionalSchemeFactory`/`NodesStack` as `contour`, just rooted at `function`.
   * Keyed `text-function` because `function` is already the Logic (TypeScript) document type below. */
  'text-function': {
    label: 'Function',
    rootNodeName: 'function',
    buildScheme: (params) => functionalSchemeFactory(params),
  },
  'mind-tree': {
    label: 'Tree',
    rootNodeName: 'mind-tree',
    buildScheme: (params) => mindTreeSchemeFactory(params),
  },
  function: {
    label: 'Logic',
    rootNodeName: 'function',
    buildScheme: (params) => typescriptFunctionalSchemeFactory(params),
  },
  'objects-structure': {
    label: 'Structure',
    rootNodeName: 'objects-structure',
    buildScheme: (params) => objectsStructureSchemeFactory(params),
  },
  'enum-structure': {
    label: 'Enum',
    rootNodeName: ENUM_STRUCTURE_NAME,
    buildScheme: (params) => enumStructureSchemeFactory(params),
  },
  'external-api-structure': {
    label: 'External API',
    rootNodeName: EXTERNAL_API_STRUCTURE_NAME,
    buildScheme: (params) => externalApiStructureSchemeFactory(params),
  },
  'simple-code-cpp': codeDocumentTypeConfig('cpp'),
  'simple-code-js': codeDocumentTypeConfig('js'),
  'simple-code-ts': codeDocumentTypeConfig('ts'),
  'simple-code-php': codeDocumentTypeConfig('php'),
  'simple-code-rust': codeDocumentTypeConfig('rust'),
};

export const ALL_SKETCH_DOCUMENT_TYPES = Object.keys(SKETCH_DOCUMENT_TYPES) as SketchDocumentType[];

const buildStandaloneDocumentContainer = (): DependencyContainer => {
  const child = container.createChildContainer();
  registerProjectDocumentsRegistry(child);
  registerTypescriptProjectService(child);
  return child;
};

/** The id of the throwaway scheme below: never rendered or persisted, so its uniqueness is immaterial. */
const randomSchemeId = (): string =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `default-root-${Math.random().toString(36).slice(2)}`;

/**
 * Builds the default (empty) tree for a brand-new document of `type`, with no document id/name of
 * its own yet — a disposable one-off `Scheme` just to reach `scheme.infra.structure.factory()`.
 * `parentContainer` is optional: when omitted, a fresh one-off child container is built and thrown
 * away, which is behaviorally identical to reusing a project's real container here, since
 * `factory()` only builds a document type's bare default tree and never consults the project-wide
 * functions/types/external-API registries `registerTypescriptProjectService` wires up. Lets a project's default
 * document root be built *before* any project store/container exists (a brand-new project has neither yet).
 */
export const buildDefaultSketchDocumentRoot = (
  type: SketchDocumentType,
  parentContainer?: DependencyContainer,
): INode => {
  const config = SKETCH_DOCUMENT_TYPES[type];
  const scheme = config.buildScheme({
    id: randomSchemeId(),
    name: 'root',
    parentContainer: parentContainer ?? buildStandaloneDocumentContainer(),
  });
  const root = scheme.infra.structure.factory(config.rootNodeName);
  scheme.dispose();
  return root;
};
