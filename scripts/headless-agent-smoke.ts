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
import { CMD_INSERT_NODE, CMD_SET_DATA, createINodeByName } from '@falang/scheme';
import { createWorkflowAgentSession } from '../packages/workflow/client-common/src/agent/create-workflow-agent-session.js';
import { assert, compileAndTypeCheck, HeadlessWorkflowStore } from './headless-workflow-store.js';

const toolCall = (name: string, input: unknown, id = name): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input, name }],
});

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

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
