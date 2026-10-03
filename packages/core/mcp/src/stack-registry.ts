import type { INode } from '@falang/dto';
import { commentCfg, mindTreeCfg, NodesGroup, NodesStack } from '@falang/dto';
import {
  CODE_LANGUAGES,
  codeFunctionNodesGroup,
  CODE_DOCUMENT_TYPE_BY_LANGUAGE,
  CODE_ROOT_NODE_NAME,
} from '@falang/simple-code-dto';
import { getTextGroup, stringDataType as textStringDataType } from '@falang/text-dto';
import {
  enumStructureNodes,
  externalApiStructureNodes,
  functionNodesGroup,
  objectStructureNodes,
} from '@falang/typescript-dto';
import {
  activepiecesActionNodesGroup,
  magicNodesGroup,
  triggerFunctionNodesGroup,
  TRIGGER_FUNCTION_NAME,
} from '@falang/workflow-dto';

/**
 * One registered document type: the `NodesStack` that validates it / serves `get_node_kinds` for it,
 * plus the node kind its document root is (used to build the default tree a `create_document` call
 * with no `root` gets, via `NodesStack.factory(rootNodeName)`). Kept as an entry object rather than a
 * bare `NodesStack` because the two aren't always the same string — every `code-*` document type
 * shares one `NodesStack` rooted at `code-function` (see the "code" registration below), and the
 * workflow `function`/`trigger-function` document types share one combined stack rooted at two
 * different node kinds.
 */
export interface IDocumentTypeRegistration {
  readonly stack: NodesStack;
  readonly rootNodeName: string;
}

/**
 * Maps `projectType → documentType → NodesStack` (+ default-root-tree metadata), built once from
 * `*-dto` packages only — no `*-scheme` package is imported here (they pull in monaco-editor, see
 * ADR 0029 (private)). Hosts that need a document type this package
 * cannot see from dto-level code alone (e.g. the Arduino desktop app's pin/driver node kinds, or the
 * workflow product's per-vendor `integration-action`/question/choice node kinds, which only exist
 * once a runtime integration catalog is loaded) call `registerProjectType` themselves.
 */
export class DocumentStackRegistry {
  private readonly projectTypes = new Map<string, Map<string, IDocumentTypeRegistration>>();

  registerProjectType(projectType: string, documentTypes: Record<string, IDocumentTypeRegistration>): void {
    const existing = this.projectTypes.get(projectType) ?? new Map<string, IDocumentTypeRegistration>();
    for (const [documentType, registration] of Object.entries(documentTypes)) {
      existing.set(documentType, registration);
    }
    this.projectTypes.set(projectType, existing);
  }

  getProjectTypes(): readonly string[] {
    return [...this.projectTypes.keys()];
  }

  getDocumentTypes(projectType: string): readonly string[] {
    return [...(this.projectTypes.get(projectType)?.keys() ?? [])];
  }

  getRegistration(projectType: string, documentType: string): IDocumentTypeRegistration | undefined {
    return this.projectTypes.get(projectType)?.get(documentType);
  }

  getStack(projectType: string, documentType: string): NodesStack | undefined {
    return this.getRegistration(projectType, documentType)?.stack;
  }

  /** The tree `create_document` uses when `root` is omitted — the document type's own default factory output. */
  getDefaultRoot(projectType: string, documentType: string): INode | undefined {
    const registration = this.getRegistration(projectType, documentType);
    // oxlint-disable-next-line no-undefined
    return registration ? registration.stack.factory(registration.rootNodeName) : undefined;
  }
}

const MIND_TREE_NAME = 'mind-tree';

/**
 * `mind-tree` documents have no exported `NodesGroup` of their own anywhere (unlike `contour`'s
 * `getTextGroup()`) — `@falang/text-scheme`'s `mind-tree.ts` builds one inline from `@falang/dto`'s
 * `mindTreeCfg` plus `@falang/text-dto`'s `stringDataType`. Both of those are dto-level, so the same
 * stack is replicated here without importing `@falang/text-scheme` (which would pull in monaco).
 */
const buildMindTreeRegistration = (): IDocumentTypeRegistration => ({
  rootNodeName: MIND_TREE_NAME,
  stack: new NodesStack([
    new NodesGroup(
      mindTreeCfg({
        body: textStringDataType,
        child: textStringDataType,
        header: textStringDataType,
        name: MIND_TREE_NAME,
        thread: textStringDataType,
      }),
    ),
  ]),
});

/**
 * `packages/desktop/app-sketch` now creates a project with `falang.json`'s `type` set to one of
 * these real, per-project-type strings (see its own `src/shared/project-types.ts`) rather than the
 * single hardcoded `'text'` every project used to get — see
 * ADR 0005 (private)'s "Implementation notes (project types, new-project
 * dialog, single default document — 2026-09-20)". `'text'` documents (prose/mind-map trees) and
 * `'logic'` documents (typed function/structure trees) are genuinely separate project types now, and
 * each `simple-code-<language>` gets its own project type — one document type apiece, all five
 * sharing one `NodesStack` rooted at `code-function` (`codeStack` below), same as before.
 *
 * A project created by a pre-2026-09-20 build of this app still has `type: 'text'` in its
 * `falang.json` regardless of what it actually contains (its `function`/`simple-code-*` documents
 * still open fine in the editor, which reads document types straight off each document, not off the
 * project's own `type`) — but `create_document`/`set_document` against it over MCP are now stricter
 * than before: `'text'` only allows `contour`/`text-function`/`mind-tree`, so creating a new `function` document (or
 * validating an existing one) in such a project fails until its `falang.json` `type` is corrected by
 * hand to `'logic'` (or whichever type actually matches). Flagged as a known, acceptable pre-release
 * gap in that ADR's implementation notes — no migration was written for it.
 */
const buildTextProjectTypeDocuments = (): Record<string, IDocumentTypeRegistration> => {
  // `contour` and `text-function` (the text domain's own single-function document, the old app's
  // `text`-project `function` root — keyed `text-function` since `function` is `'logic'`'s TypeScript
  // document type) share one text `NodesStack`; only the root node name differs.
  const textStack = new NodesStack([getTextGroup()]);
  return {
    contour: { rootNodeName: 'contour', stack: textStack },
    'text-function': { rootNodeName: 'function', stack: textStack },
    'mind-tree': buildMindTreeRegistration(),
  };
};

const buildLogicProjectTypeDocuments = (): Record<string, IDocumentTypeRegistration> => ({
  'enum-structure': { rootNodeName: 'enum-structure', stack: new NodesStack([enumStructureNodes]) },
  'external-api-structure': {
    rootNodeName: 'external-api-structure',
    stack: new NodesStack([externalApiStructureNodes]),
  },
  function: { rootNodeName: 'function', stack: new NodesStack([functionNodesGroup]) },
  'objects-structure': { rootNodeName: 'objects-structure', stack: new NodesStack([objectStructureNodes]) },
});

/** One project type per `simple-code` language (`simple-code-cpp`, …), each with exactly one document type of its own name, all five sharing one `code-function`-rooted `NodesStack`. */
const buildSimpleCodeProjectTypesDocuments = (): Record<string, Record<string, IDocumentTypeRegistration>> => {
  const codeStack = new NodesStack([codeFunctionNodesGroup]);
  const codeRegistration: IDocumentTypeRegistration = { rootNodeName: CODE_ROOT_NODE_NAME, stack: codeStack };
  return Object.fromEntries(
    CODE_LANGUAGES.map((language) => {
      const documentType = CODE_DOCUMENT_TYPE_BY_LANGUAGE[language];
      return [documentType, { [documentType]: codeRegistration }];
    }),
  );
};

/**
 * The workflow product's `function`/`trigger-function` documents both need `functionNodesGroup`'s
 * `function-header`/`function-footer` node kinds alongside their own root node kind (see
 * `triggerFunctionNodesGroup`'s own doc comment: "both stacks must register `functionNodesGroup`
 * alongside this one") — so both document types share one combined `NodesStack` instance, differing
 * only in which node kind their root is.
 *
 * Deliberately NOT registered here: per-vendor `integration-action`/`integration-trigger`/question/
 * choice node kinds (`@falang/workflow-scheme`'s `buildIntegrationNodesIconsGroup`/
 * `buildQuestionNodesIconsGroup`/`buildChoiceNodesIconsGroup`). Their node kinds are generated from a
 * *runtime* list of registered vendor integrations (`REGISTERED_INTEGRATIONS` in
 * `@falang/workflow-client-common`, which pulls in every vendor's own scheme package) — there is no
 * dto-level source for "which vendors are registered" to build them from here. A host with that
 * catalog (the future workflow `/mcp` endpoint, phase F) must call `registerProjectType` itself with
 * a stack that also includes `getIntegrationNodeConfigs(...)`/the question/choice equivalents from
 * `@falang/workflow-integrations-common`.
 */
const buildWorkflowFunctionRegistration = (): IDocumentTypeRegistration => {
  const stack = new NodesStack([
    functionNodesGroup,
    new NodesGroup(triggerFunctionNodesGroup),
    new NodesGroup(magicNodesGroup),
    new NodesGroup([commentCfg()]),
    new NodesGroup(activepiecesActionNodesGroup),
  ]);
  return { rootNodeName: 'function', stack };
};

const buildWorkflowProjectTypeDocuments = (): Record<string, IDocumentTypeRegistration> => {
  const functionRegistration = buildWorkflowFunctionRegistration();
  return {
    function: functionRegistration,
    'objects-structure': { rootNodeName: 'objects-structure', stack: new NodesStack([objectStructureNodes]) },
    [TRIGGER_FUNCTION_NAME]: { rootNodeName: TRIGGER_FUNCTION_NAME, stack: functionRegistration.stack },
  };
};

/**
 * `'text'`/`'logic'`/one `'simple-code-<language>'` per language (desktop `app-sketch`'s own real
 * project types, see `buildTextProjectTypeDocuments`'s doc comment) and `'workflow'` — see each
 * builder's own doc comment for what is/isn't covered.
 */
export const createDefaultDocumentStackRegistry = (): DocumentStackRegistry => {
  const registry = new DocumentStackRegistry();
  registry.registerProjectType('text', buildTextProjectTypeDocuments());
  registry.registerProjectType('logic', buildLogicProjectTypeDocuments());
  for (const [projectType, documents] of Object.entries(buildSimpleCodeProjectTypesDocuments())) {
    registry.registerProjectType(projectType, documents);
  }
  registry.registerProjectType('workflow', buildWorkflowProjectTypeDocuments());
  return registry;
};
