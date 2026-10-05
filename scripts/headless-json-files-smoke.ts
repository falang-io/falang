// oxlint-disable no-console, max-lines, complexity -- a linear smoke script: one assertion after another
/**
 * Headless smoke test for the in-app agent's JSON file interface (ADR 0062): in plain Node it runs the REAL workflow
 * agent session (`createWorkflowAgentSession({ agentInterface: 'json' })`) against a scripted LLM over an in-memory
 * project — list/read the files, write a new document (with an `if` whose then-branch jumps away, normalised on write),
 * get a validation error and a `check_project` type error back with their node ids, fix them — then compiles and
 * type-checks the result with the real workflow compiler and `typeCheckProject`, and undoes one write.
 *
 * Run: `npx tsx scripts/headless-json-files-smoke.ts` (part of `npm run test:headless-schemes`). Exits non-zero on failure.
 */
import 'reflect-metadata';
import { ScriptedLlmClient, type ILlmResponse, type TScriptedStep } from '@falang/agent';
import { resolveService } from '@falang/di';
import { TOKEN_HISTORY } from '@falang/scheme';
import { createWorkflowAgentSession } from '../packages/workflow/client-common/src/agent/create-workflow-agent-session.js';
import { buildWorkflowDocumentScheme } from '../packages/workflow/client-common/src/build-workflow-document-scheme.js';
import { getIntegrationInstances } from '../packages/workflow/client-common/src/integration-instances.js';
import { assert, checkProject, compileAndTypeCheck, HeadlessWorkflowStore } from './headless-workflow-store.js';

const toolCall = (name: string, input: unknown): ILlmResponse => ({
  text: '',
  toolCalls: [{ id: `${name}-${Math.random().toString(36).slice(2, 8)}`, input, name }],
});

const INT = { numberType: { integerType: 'int32', type: 'integer' }, type: 'number' };

/** What a model would write for a brand-new `functions/helper.json`: no ids anywhere, the then-branch returns early. */
const helperFile = {
  children: [
    { data: '', name: 'function-header' },
    {
      children: [
        { data: { name: 'counter', value: '1', variableType: INT }, name: 'create-var' },
        {
          children: [
            {
              children: [{ data: 'counter = counter + 1', name: 'action' }],
              name: 'if-child',
              out: { data: '', name: 'return' },
            },
            { children: [{ data: 'counter checked', name: 'log' }], name: 'if-child' },
          ],
          data: 'counter > 0',
          name: 'if',
        },
        { data: 'counter = 0', name: 'action' },
      ],
      data: { parameters: [] },
      name: 'function-body',
    },
    { data: '', name: 'function-footer' },
  ],
  name: 'function',
};

/** Everything the scripted run must have produced: one rejected edit, the tool set, NODES.md, both check_project
 *  results, and the re-oriented `if`. */
const assertRun = (
  session: ReturnType<typeof createWorkflowAgentSession>,
  client: ScriptedLlmClient,
  store: HeadlessWorkflowStore,
  helperDocumentId: string,
): void => {
  assert(session.status === 'done', `agent run ended ${session.status}: ${session.error}`);

  const steps = session.steps.map((step) => ({ name: step.call.name, result: step.result }));
  const failed = steps.filter((step) => !step.result.ok);
  assert(failed.length === 1, `expected exactly the one bad edit to fail: ${JSON.stringify(failed)}`);
  const bad = failed[0].result;
  assert(
    !bad.ok &&
      bad.error.includes('create-var') &&
      bad.error.includes('schemas/create-var.json') &&
      bad.error.includes('nothing was changed'),
    `validation error does not name the node: ${JSON.stringify(bad)}`,
  );
  const toolNames = new Set(client.requests[0]?.tools.map((tool) => tool.name));
  for (const name of [
    'list_files',
    'read_file',
    'write_file',
    'edit_file',
    'check_project',
    'create_trigger_document',
    'finish',
  ]) {
    assert(toolNames.has(name), `json session did not offer ${name}`);
  }
  for (const name of ['get_tree', 'insert_nodes', 'get_node_kinds'])
    assert(!toolNames.has(name), `json session offered ${name}`);

  const nodesMd = steps[1].result;
  assert(
    nodesMd.ok && nodesMd.content.includes('function-body') && !nodesMd.content.includes('set_meta'),
    'NODES.md is off',
  );
  const firstCheck = steps.find((step) => step.name === 'check_project')?.result ?? { error: 'no check', ok: false };
  assert(
    firstCheck.ok &&
      firstCheck.content.includes('missingFunction') &&
      firstCheck.content.includes('"file":"functions/main.json"'),
    `check_project did not attribute the type error: ${JSON.stringify(firstCheck)}`,
  );
  assert(firstCheck.ok && firstCheck.content.includes('"kind":"action"'), 'check_project did not name the node kind');
  const lastCheck = steps.findLast((step) => step.name === 'check_project')?.result;
  assert(lastCheck, 'no check_project call');
  assert(lastCheck.ok && lastCheck.content === '{"ok":true}', `project still has errors: ${JSON.stringify(lastCheck)}`);

  // The early-return branch was moved off slot 0 (first-child-out rule) and the if's side flipped.
  const helper = store.getScheme(helperDocumentId);
  const ifNode = helper.rootNode?.children[1].children[1];
  assert(ifNode?.name === 'if' && ifNode.meta?.trueOnRight === true, 'if was not re-oriented');
  assert(ifNode.children[0].out === null && ifNode.children[1].out?.name === 'return', 'early return not on slot 1');
};

const runAgent = async (store: HeadlessWorkflowStore): Promise<void> => {
  const mainId = store.createDocument('function', 'main');
  const helperId = () => store.documents.find((doc) => doc.name === 'helper')?.id ?? '';
  const emptyBody = '"children": []';
  const callHelper = () =>
    JSON.stringify({
      data: { iconId: '', parameters: [], returnVariable: '', schemeId: helperId() },
      name: 'call-function',
    });
  const script: TScriptedStep[] = [
    toolCall('list_files', {}),
    toolCall('read_file', { path: 'NODES.md' }),
    toolCall('read_file', { path: 'functions/main.json' }),
    toolCall('write_file', { content: JSON.stringify(helperFile, null, 2), path: 'functions/helper.json' }),
    // A data error: `create-var` without its required variableType — nothing may be applied.
    toolCall('edit_file', {
      new_string: '"children": [{ "name": "create-var", "data": { "name": "x", "value": "1" } }]',
      old_string: emptyBody,
      path: 'functions/main.json',
    }),
    // A type error only the compiler sees.
    toolCall('edit_file', {
      new_string: '"children": [{ "name": "action", "data": "missingFunction()" }]',
      old_string: emptyBody,
      path: 'functions/main.json',
    }),
    toolCall('check_project', {}),
    () =>
      toolCall('edit_file', {
        new_string: `"data": "missingFunction()"\n        }, ${callHelper()}`,
        old_string: '"data": "missingFunction()"\n        }',
        path: 'functions/main.json',
      }),
    toolCall('edit_file', {
      new_string: '"data": "1 + 1"',
      old_string: '"data": "missingFunction()"',
      path: 'functions/main.json',
    }),
    toolCall('check_project', {}),
    toolCall('finish', { message: 'Added helper and called it from main.' }),
  ];
  const client = new ScriptedLlmClient(script);
  const session = createWorkflowAgentSession({
    agentInterface: 'json',
    buildStack: (type) =>
      buildWorkflowDocumentScheme({
        doc: { id: `__stack_${type}`, name: 'stack', type },
        getCredentialInstances: () => getIntegrationInstances(store.documents),
        parentContainer: store.container,
      }).infra.structure,
    checkProject: () => Promise.resolve(checkProject(store)),
    focusPauseMs: 0,
    llmClient: client,
    store,
  });
  await session.run('Add a helper with a counter and call it from main.', { activeDocumentId: mainId });
  assertRun(session, client, store, helperId());
};

const undoOneWrite = (store: HeadlessWorkflowStore): void => {
  const helper = store.documents.find((doc) => doc.name === 'helper');
  assert(helper, 'helper missing');
  const scheme = store.getScheme(helper.id);
  const body = () => scheme.rootNode?.children[1];
  const before = body()?.children.length;
  const history = resolveService(TOKEN_HISTORY, scheme.container);
  history.back();
  assert(body()?.children.length === 0, `undo did not revert the whole write (${before} → ${body()?.children.length})`);
  history.forward();
  assert(body()?.children.length === before, 'redo did not restore the write');
};

const main = async (): Promise<void> => {
  const store = new HeadlessWorkflowStore();
  try {
    await runAgent(store);
    console.log(
      'ok   json session: list/read, write new document, validation error, check_project error → fix, finish',
    );
    undoOneWrite(store);
    console.log('ok   one write = one undo step');
    const compiled = compileAndTypeCheck(store);
    assert(
      compiled.workflows.includes('counter = counter + 1') && compiled.workflows.includes('1 + 1'),
      'compiled output misses the written nodes',
    );
    console.log('ok   compile + type-check after the json run');
  } finally {
    store.dispose();
  }
};

main().then(
  () => {
    console.log('\nAll headless JSON-file checks passed');
  },
  (error: unknown) => {
    console.error('FAIL', error);
    process.exitCode = 1;
  },
);
