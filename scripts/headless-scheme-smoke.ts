// oxlint-disable no-console
/**
 * Headless smoke test for the scheme packages (ADR 0051, agent tuner phase 0): builds a real `Scheme` with every
 * product's real scheme factory in PLAIN NODE (no browser, no bundler, no vitest, no module mocks), inserts a node
 * through the scheme's own command bus, serializes the tree and validates it against the document registry.
 *
 * Run: `npx tsx scripts/headless-scheme-smoke.ts` (or `npm run test:headless-schemes`). Exits non-zero on any failure.
 */
import 'reflect-metadata';
import { container as rootContainer } from '@falang/di';
import type { INode, IProjectDocument } from '@falang/dto';
import { createDefaultDocumentStackRegistry, validateDocument } from '@falang/mcp-core';
import {
  CMD_INSERT_NODE,
  createINodeByName,
  createNodeStoreFromNode,
  getNodeStoreDto,
  HistoryModule,
  registerGlobalTokens,
  setRootNodeForScheme,
  type IModule,
  type NodeStore,
  type Scheme,
} from '@falang/scheme';
import { codeFunctionalSchemeFactory } from '@falang/simple-code-scheme';
import { CODE_DOCUMENT_TYPE_BY_LANGUAGE, CODE_LANGUAGES } from '@falang/simple-code-dto';
import { functionalSchemeFactory as textFunctionalSchemeFactory, mindTreeSchemeFactory } from '@falang/text-scheme';
import {
  enumStructureSchemeFactory,
  externalApiStructureSchemeFactory,
  functionalSchemeFactory as typescriptFunctionalSchemeFactory,
  objectsStructureSchemeFactory,
} from '@falang/typescript-scheme';
import {
  buildMagicFunctionDocument,
  magicFunctionSchemeFactory,
  workflowFunctionalSchemeFactory,
} from '@falang/workflow-scheme';
import { REGISTERED_INTEGRATIONS } from '../packages/workflow/client-common/src/integrations-registry.js';

interface ICase {
  readonly label: string;
  /** Project type + document type to validate against `createDefaultDocumentStackRegistry()`. */
  readonly projectType: string;
  readonly documentType: string;
  /** Root node name of the document (the stack's own factory builds its default tree). */
  readonly rootNodeName: string;
  readonly build: (document: IProjectDocument | undefined, extraModules: IModule[]) => Scheme;
  /**
   * Build the scheme with no `document` and set the stack's default root afterwards (as the playground does) — needed
   * where the default tree from `NodesStack.factory` doesn't itself pass `parseDocument` (the text `contour` one).
   */
  readonly setRootAfterBuild?: boolean;
  /** Where to insert, and what. `null` = just open + serialize (no insert). */
  readonly insert: { readonly parentName: string; readonly nodeName: string } | null;
}

const registry = createDefaultDocumentStackRegistry();
const base = { parentContainer: rootContainer };

const cases: ICase[] = [
  {
    build: (document, extraModules) =>
      workflowFunctionalSchemeFactory({ ...base, document, extraModules, integrations: REGISTERED_INTEGRATIONS }),
    documentType: 'function',
    insert: { nodeName: 'action', parentName: 'function-body' },
    label: 'workflow function',
    projectType: 'workflow',
    rootNodeName: 'function',
  },
  {
    build: (document, extraModules) =>
      workflowFunctionalSchemeFactory({ ...base, document, extraModules, integrations: REGISTERED_INTEGRATIONS }),
    documentType: 'function',
    insert: { nodeName: 'magic', parentName: 'function-body' },
    label: 'workflow function + magic node',
    projectType: 'workflow',
    rootNodeName: 'function',
  },
  {
    build: (document, extraModules) => typescriptFunctionalSchemeFactory({ ...base, document, extraModules }),
    documentType: 'function',
    insert: { nodeName: 'action', parentName: 'function-body' },
    label: 'typescript function',
    projectType: 'logic',
    rootNodeName: 'function',
  },
  {
    build: (document, extraModules) => objectsStructureSchemeFactory({ ...base, document, extraModules }),
    documentType: 'objects-structure',
    insert: null,
    label: 'typescript objects-structure',
    projectType: 'logic',
    rootNodeName: 'objects-structure',
  },
  {
    build: (document, extraModules) => enumStructureSchemeFactory({ ...base, document, extraModules }),
    documentType: 'enum-structure',
    insert: null,
    label: 'typescript enum-structure',
    projectType: 'logic',
    rootNodeName: 'enum-structure',
  },
  {
    build: (document, extraModules) => externalApiStructureSchemeFactory({ ...base, document, extraModules }),
    documentType: 'external-api-structure',
    insert: null,
    label: 'typescript external-api-structure',
    projectType: 'logic',
    rootNodeName: 'external-api-structure',
  },
  {
    build: (document, extraModules) => textFunctionalSchemeFactory({ ...base, document, extraModules }),
    setRootAfterBuild: true,
    documentType: 'contour',
    insert: { nodeName: 'action', parentName: 'contour-function-body' },
    label: 'text contour',
    projectType: 'text',
    rootNodeName: 'contour',
  },
  {
    build: (document, extraModules) => mindTreeSchemeFactory({ ...base, document, extraModules }),
    documentType: 'mind-tree',
    insert: { nodeName: 'mind-tree-child', parentName: 'mind-tree-thread' },
    label: 'text mind-tree',
    projectType: 'text',
    rootNodeName: 'mind-tree',
  },
  ...CODE_LANGUAGES.map(
    (language): ICase => ({
      build: (document, extraModules) => codeFunctionalSchemeFactory({ ...base, document, extraModules, language }),
      documentType: CODE_DOCUMENT_TYPE_BY_LANGUAGE[language],
      insert: { nodeName: 'action', parentName: 'code-function-body' },
      label: `simple-code ${language}`,
      projectType: CODE_DOCUMENT_TYPE_BY_LANGUAGE[language],
      rootNodeName: 'code-function',
    }),
  ),
];

/**
 * `getNodeStoreDto` deliberately omits falsy `data` (`''`/`null`) and empty `children` arrays, so its output is compact
 * but not re-parseable by the strict `NodesStack` validators on its own (the same document would fail `parseDocument`).
 * This overlays exactly those omitted fields back from the live stores so the tree can be validated as a document.
 */
const restoreOmittedFields = (dto: INode, store: NodeStore): INode => {
  const restored: INode = { ...dto };
  // oxlint-disable-next-line no-undefined
  if (!('data' in dto) && store.data !== undefined) restored.data = store.data;
  restored.children = store.children.map((child, index) =>
    restoreOmittedFields(dto.children?.[index] ?? { id: child.id, name: child.name }, child),
  );
  return restored;
};

const findNode = (scheme: Scheme, name: string) => {
  const stack = scheme.rootNode ? [scheme.rootNode] : [];
  while (stack.length > 0) {
    const node = stack.shift();
    if (!node) break;
    if (node.name === name) return node;
    stack.push(...node.children);
  }
  return null;
};

const runCase = (testCase: ICase): void => {
  registerGlobalTokens();
  const stack = registry.getStack(testCase.projectType, testCase.documentType);
  if (!stack) throw new Error(`no stack for ${testCase.projectType}/${testCase.documentType}`);
  const document: IProjectDocument = {
    id: 'doc-1',
    name: 'smoke',
    root: stack.factory(testCase.rootNodeName),
    type: testCase.documentType,
  };
  // oxlint-disable-next-line no-undefined
  const scheme = testCase.build(testCase.setRootAfterBuild ? undefined : document, [new HistoryModule()]);
  if (testCase.setRootAfterBuild) setRootNodeForScheme(scheme, createNodeStoreFromNode(document.root, scheme));
  try {
    if (testCase.insert) {
      const parent = findNode(scheme, testCase.insert.parentName);
      if (!parent) throw new Error(`parent "${testCase.insert.parentName}" not found`);
      const before = parent.children.length;
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: before,
        node: createINodeByName(testCase.insert.nodeName, scheme),
        parentId: parent.id,
      });
      if (parent.children.length !== before + 1) throw new Error('node was not inserted');
    }
    if (!scheme.rootNode) throw new Error('scheme has no root node');
    const root = restoreOmittedFields(getNodeStoreDto(scheme.rootNode, scheme), scheme.rootNode);
    const result = validateDocument(testCase.projectType, { ...document, root }, registry);
    if (!result.ok) throw new Error(`validateDocument: ${result.error}`);
  } finally {
    scheme.dispose();
  }
};

/** The magic node's popup scheme (`magic-function` root) builds from a magic node's own subtree. */
const runMagicPopupCase = (): void => {
  registerGlobalTokens();
  const magic: INode = {
    children: [{ data: 'noop()', id: 'x', name: 'action' }],
    data: { spell: 'greet' },
    id: 'm',
    name: 'magic',
  };
  const scheme = magicFunctionSchemeFactory({
    ...base,
    document: { id: 'popup', name: 'popup', root: buildMagicFunctionDocument(magic, []), type: 'magic-function' },
    integrations: REGISTERED_INTEGRATIONS,
  });
  try {
    if (!scheme.icons.getIconSafe('x')) throw new Error('popup scheme has no icon for the magic node child');
  } finally {
    scheme.dispose();
  }
};

let failed = 0;
for (const testCase of cases) {
  try {
    runCase(testCase);
    console.log(`ok   ${testCase.label}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${testCase.label}:`, error);
  }
}
try {
  runMagicPopupCase();
  console.log('ok   workflow magic popup scheme');
} catch (error) {
  failed += 1;
  console.error('FAIL workflow magic popup scheme:', error);
}
console.log(
  failed === 0
    ? `\nAll ${cases.length + 1} headless scheme checks passed`
    : `\n${failed} of ${cases.length + 1} failed`,
);
process.exitCode = failed === 0 ? 0 : 1;
