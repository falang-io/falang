// oxlint-disable no-console, max-lines
/**
 * Headless end-to-end smoke test for the workflow product's in-app agent (ADR 0051, agent tuner phase 0, part B): in PLAIN
 * NODE (no browser, bundler, vitest or module mocks) it builds an in-memory project, runs the REAL agent session — built
 * by the same `createWorkflowAgentSession` the editor's `WorkflowStore` calls — against a scripted LLM, runs one magic
 * node through the same `createWorkflowMagicRunStore`, then compiles the result with the real workflow compiler and
 * type-checks it with the real `typeCheckProject`. Schemes come from `buildWorkflowDocumentScheme`, the editor's own
 * per-document scheme builder; the only thing this file supplies is the in-memory `IWorkflowAgentStore` (the editor's
 * is the network-backed `WorkflowStore`).
 *
 * Run: `npx tsx scripts/headless-agent-smoke.ts` (or `npm run test:headless-schemes`). Exits non-zero on any failure.
 */
import 'reflect-metadata';
import { ScriptedLlmClient, type ILlmResponse, type TScriptedStep } from '@falang/agent';
import { container as rootContainer, resolveService, type DependencyContainer } from '@falang/di';
import { CMD_INSERT_NODE, CMD_SET_DATA, createINodeByName, registerGlobalTokens, type Scheme } from '@falang/scheme';
import { registerTypescriptProjectService, TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '@falang/typescript-scheme';
import { compileProject, type ICompileProjectParams } from '@falang/workflow-compiler';
import {
  INTEGRATIONS_DOCUMENT_TYPE,
  type IIntegrationInstance,
  type IIntegrationsDocumentData,
} from '@falang/workflow-integrations-common';
import { typeCheckProject } from '../packages/workflow/backend/src/domains/build/build/type-check-project.js';
import { createWorkflowAgentSession } from '../packages/workflow/client-common/src/agent/create-workflow-agent-session.js';
import { createWorkflowMagicRunStore } from '../packages/workflow/client-common/src/agent/create-workflow-magic-run-store.js';
import type { IApiVendorData } from '../packages/workflow/client-common/src/api-types.js';
import type { IWorkflowAgentStore } from '../packages/workflow/client-common/src/agent/workflow-agent-store.js';
import { buildWorkflowDocumentScheme } from '../packages/workflow/client-common/src/build-workflow-document-scheme.js';
import { getIntegrationInstances } from '../packages/workflow/client-common/src/integration-instances.js';
import { REGISTERED_INTEGRATIONS } from '../packages/workflow/client-common/src/integrations-registry.js';
import {
  subscribeWorkflowDocumentSync,
  syncWorkflowDocumentFromScheme,
} from '../packages/workflow/client-common/src/sync-document-from-scheme.js';
import { buildTriggerFunctionDocument } from '../packages/workflow/client-common/src/trigger-function-document.js';
import type { DocumentType, WorkflowDocument } from '../packages/workflow/client-common/src/workflow-types.js';

/** `WorkflowStore` with the network, IndexedDB and tabs taken out: documents live in memory, schemes are the real ones. */
class HeadlessWorkflowStore implements IWorkflowAgentStore {
  readonly documents: WorkflowDocument[] = [];
  readonly vendorData = { byInstance: new Map<string, IApiVendorData>() };
  readonly container: DependencyContainer = rootContainer.createChildContainer();
  readonly magicRuns = createWorkflowMagicRunStore({
    createLlmClient: () => this.magicClient,
    focusPauseMs: 0,
    getAllowQuestions: () => false,
    store: this,
  });
  magicClient: ScriptedLlmClient = new ScriptedLlmClient([]);
  private readonly schemes = new Map<string, Scheme>();
  private nextId = 1;

  constructor() {
    registerGlobalTokens();
    registerTypescriptProjectService(this.container);
    this.documents.push({
      customData: { instances: [] } satisfies IIntegrationsDocumentData,
      folderId: null,
      id: 'integrations',
      name: 'integrations',
      pinned: true,
      type: INTEGRATIONS_DOCUMENT_TYPE,
    });
  }

  get typesRegistry() {
    return resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, this.container).typesRegistry;
  }

  getDocument(documentId: string): WorkflowDocument | undefined {
    return this.documents.find((doc) => doc.id === documentId);
  }

  createDocument(type: DocumentType, name: string, folderId: string | null = null): string {
    this.nextId += 1;
    const id = `doc-${this.nextId}`;
    this.documents.push({ folderId, id, name, type });
    return id;
  }

  createTriggerFunctionDocument(
    name: string,
    bodyData: Parameters<typeof buildTriggerFunctionDocument>[1],
    folderId: string | null = null,
  ): string {
    const doc = buildTriggerFunctionDocument(name, bodyData, folderId);
    this.documents.push(doc);
    return doc.id;
  }

  saveIntegrationInstance(instance: IIntegrationInstance): void {
    const integrations = this.getDocument('integrations');
    const instances = [...getIntegrationInstances(this.documents).filter((item) => item.id !== instance.id), instance];
    if (integrations) integrations.customData = { instances } satisfies IIntegrationsDocumentData;
  }

  getScheme(documentId: string): Scheme {
    const existing = this.schemes.get(documentId);
    if (existing) return existing;
    const doc = this.getDocument(documentId);
    if (!doc) throw new Error(`Document ${documentId} not found`);
    if (doc.pinned) throw new Error(`Document ${documentId} is pinned and has no scheme editor`);
    const isFunctionDoc = doc.type === 'function' || doc.type === 'trigger-function';
    const scheme = buildWorkflowDocumentScheme({
      doc,
      getCredentialInstances: () => getIntegrationInstances(this.documents),
      onSchemeCreated: (created) => {
        if (isFunctionDoc) this.magicRuns.registerHost(doc.id, created);
      },
      parentContainer: this.container,
    });
    // The editor's own sync of `doc.data` and the types registry on every change (its autosave hook is host-only).
    subscribeWorkflowDocumentSync(doc, scheme, this.typesRegistry);
    this.schemes.set(documentId, scheme);
    return scheme;
  }

  /** The tree the editor would save/compile: `doc.data` (kept current by the shared sync), serialized on demand for a never-edited one. */
  rootOf(doc: WorkflowDocument) {
    const scheme = this.schemes.get(doc.id);
    if (scheme) syncWorkflowDocumentFromScheme(doc, scheme, this.typesRegistry);
    return doc.data;
  }

  dispose(): void {
    this.magicRuns.dispose();
    for (const scheme of this.schemes.values()) scheme.dispose();
  }
}

const toolCall = (name: string, input: unknown, id = name): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input, name }],
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const compileAndTypeCheck = (store: HeadlessWorkflowStore): { workflows: string; activities: string } => {
  const documents = store.documents
    .filter((doc) => doc.type === 'function' || doc.type === 'trigger-function')
    .map((doc) => ({ id: doc.id, name: doc.name, root: store.rootOf(doc), type: doc.type }));
  const compiled = compileProject({
    documents: documents as unknown as ICompileProjectParams['documents'],
    integrations: REGISTERED_INTEGRATIONS,
    trackPosition: true,
  });
  const errors = typeCheckProject(compiled.workflows, compiled.activities);
  assert(errors.length === 0, `generated code does not type-check:\n${JSON.stringify(errors, null, 2)}`);
  return compiled;
};

const runAgent = async (store: HeadlessWorkflowStore): Promise<void> => {
  const mainId = store.createDocument('function', 'main');
  const bodyIdOf = (documentId: string): string => {
    const body = store.getScheme(documentId).rootNode?.children.find((child) => child.name === 'function-body');
    assert(body, `document ${documentId} has no function-body`);
    return body.id;
  };
  const script: TScriptedStep[] = [
    toolCall('get_node_kinds', { parentId: bodyIdOf(mainId), documentId: mainId }),
    toolCall('create_document', { name: 'helper', type: 'function' }),
    () => {
      const helper = store.documents.find((doc) => doc.name === 'helper');
      assert(helper, 'create_document did not create the helper document');
      return toolCall('insert_nodes', {
        documentId: helper.id,
        index: 0,
        node: {
          data: {
            name: 'counter',
            value: '1',
            variableType: { numberType: { integerType: 'int32', type: 'integer' }, type: 'number' },
          },
          name: 'create-var',
        },
        parentId: bodyIdOf(helper.id),
      });
    },
    () => {
      const helper = store.documents.find((doc) => doc.name === 'helper');
      return toolCall('insert_nodes', {
        documentId: helper?.id,
        index: 1,
        node: { data: 'counter = counter + 1', name: 'action' },
        parentId: bodyIdOf(helper?.id ?? ''),
      });
    },
    toolCall('create_document', { name: 'GameTypes', type: 'objects-structure' }),
    () => {
      const types = store.documents.find((doc) => doc.name === 'GameTypes');
      assert(types, 'create_document did not create GameTypes');
      // The placeholder interface's thread (`objects-structure` > body > first thread): rename it.
      const thread = store.getScheme(types.id).rootNode?.children[1]?.children[0];
      assert(thread, 'GameTypes has no placeholder interface');
      return toolCall('set_data', { data: 'PlayerState', documentId: types.id, id: thread.id });
    },
    toolCall('list_types', {}),
    toolCall('finish', { message: 'Created helper with a counter.' }),
  ];
  const client = new ScriptedLlmClient(script);
  const opened: string[] = [];
  let finished = 0;
  const session = createWorkflowAgentSession({
    focusPauseMs: 0,
    llmClient: client,
    onOpenDocument: (documentId) => opened.push(documentId),
    onRunFinished: () => {
      finished += 1;
    },
    store,
  });
  const started = Date.now();
  await session.run('Add a helper function with a counter.', { activeDocumentId: mainId });
  assert(Date.now() - started < 2000, 'run took suspiciously long — focusPauseMs: 0 should skip the pause');

  assert(session.status === 'done', `agent run ended ${session.status}: ${session.error}`);
  const failed = session.steps.filter((step) => !step.result.ok);
  assert(failed.length === 0, `failed steps: ${JSON.stringify(failed.map((step) => [step.call.name, step.result]))}`);
  assert(
    store.documents.some((doc) => doc.name === 'helper'),
    'helper document missing',
  );
  assert(finished === 1 && opened.length > 0, 'onRunFinished/onOpenDocument were not called');

  // The agent's edit to an objects-structure document must be visible to a later `list_types` in the same run.
  const listTypes = session.steps.find((step) => step.call.name === 'list_types');
  assert(
    listTypes?.result.ok && listTypes.result.content.includes('PlayerState'),
    `list_types did not see the renamed interface: ${JSON.stringify(listTypes?.result)}`,
  );

  const toolNames = new Set(client.requests[0]?.tools.map((tool) => tool.name));
  for (const name of [
    'get_tree',
    'insert_nodes',
    'create_document',
    'create_trigger_document',
    'list_types',
    'search_integrations',
    'ask_user',
  ]) {
    assert(toolNames.has(name), `session did not offer tool ${name}`);
  }
};

const runMagic = async (store: HeadlessWorkflowStore): Promise<void> => {
  const helper = store.documents.find((doc) => doc.name === 'helper');
  assert(helper, 'helper document missing');
  const scheme = store.getScheme(helper.id);
  const body = scheme.rootNode?.children.find((child) => child.name === 'function-body');
  assert(body, 'helper has no function-body');
  const magic = createINodeByName('magic', scheme);
  scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: body.children.length, node: magic, parentId: body.id });
  scheme.commands.dispatchCommand(CMD_SET_DATA, { data: { spell: 'increment the counter again' }, id: magic.id });

  store.magicClient = new ScriptedLlmClient([
    toolCall('fill_magic_node', { children: [{ data: 'counter = counter + 2', name: 'action' }], nodeId: magic.id }),
    toolCall('finish', { message: 'Incremented.' }),
  ]);
  store.magicRuns.startGenerate(helper.id, magic.id);
  const deadline = Date.now() + 5000;
  while (store.magicRuns.getState(helper.id, magic.id).status !== 'idle') {
    assert(
      Date.now() < deadline,
      `magic run did not settle: ${JSON.stringify(store.magicRuns.getState(helper.id, magic.id))}`,
    );
    // oxlint-disable-next-line no-await-in-loop -- polling for the run to settle
    await sleep(10);
  }
  const node = scheme.nodes.getNode(magic.id);
  assert(node.children.length === 1, `magic node was not filled (children: ${node.children.length})`);
  const names = new Set(store.magicClient.requests[0]?.tools.map((tool) => tool.name));
  assert(
    names.has('fill_magic_node') && names.has('list_types') && !names.has('create_document'),
    'unexpected magic tool set',
  );
};

const main = async (): Promise<void> => {
  const store = new HeadlessWorkflowStore();
  try {
    await runAgent(store);
    console.log('ok   agent session: get_node_kinds, create_document, insert_nodes, set_data + list_types, finish');
    const afterAgent = compileAndTypeCheck(store);
    assert(afterAgent.workflows.includes('counter = counter + 1'), 'compiled output misses the agent-inserted action');
    console.log('ok   compile + type-check after the agent run');
    await runMagic(store);
    console.log('ok   magic run via createWorkflowMagicRunStore');
    const afterMagic = compileAndTypeCheck(store);
    assert(afterMagic.workflows.includes('counter = counter + 2'), 'compiled output misses the magic-generated action');
    console.log('ok   compile + type-check after the magic run');
  } finally {
    store.dispose();
  }
};

main().then(
  () => {
    console.log('\nAll headless agent checks passed');
  },
  (error: unknown) => {
    console.error('FAIL', error);
    process.exitCode = 1;
  },
);
