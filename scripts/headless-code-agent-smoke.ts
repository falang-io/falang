// oxlint-disable no-non-null-assertion, require-array-join-separator, no-console -- spike smoke (ADR 0061 (private))
/**
 * ADR 0061 spike, G5: the in-app agent in its code interface (`agentInterface: 'code'`), headless. A scripted LLM
 * reads the generated declarations, writes a function file and a trigger file through `CodeToolProvider`, gets a type
 * error back and fixes it, then edits one line; the trees land in the real editor schemes (one undo group per write)
 * and the project compiles and type-checks with the real workflow compiler. Plain Node, no browser/vitest.
 *
 * Run: `npx tsx scripts/headless-code-agent-smoke.ts` (part of `npm run test:headless-schemes`).
 */
import 'reflect-metadata';
import { ScriptedLlmClient, type ILlmResponse, type TScriptedStep } from '@falang/agent';
import { collectIds } from '@falang/code-projection';
import { resolveService } from '@falang/di';
import { TOKEN_HISTORY } from '@falang/scheme';
import { createWorkflowAgentSession } from '../packages/workflow/client-common/src/agent/create-workflow-agent-session.js';
import { assert, compileAndTypeCheck, HeadlessWorkflowStore } from './headless-workflow-store.js';

const toolCall = (name: string, input: unknown): ILlmResponse => ({ text: '', toolCalls: [{ id: name, input, name }] });

const GREET = `/**
 * Greets the user and says how long their name is.
 */
export async function greet(chatId: number, name: string): Promise<number> {
  const length = name.length;
  if (length > 10) {
    await supportBot.sendMessage({ chatId: chatId, text: \`What a long name, \${name}!\` });
  } else {
    await supportBot.sendMessage({ chatId: chatId, text: \`Hi, \${name}!\` });
  }
  return length;
}
`;

const START_BROKEN = `export default supportBot.onCommand({ command: "/start" }, async (message: telegram.TelegramMessage): Promise<void> => {
  const length = await greet(message.chat.id, message.from?.firstName ?? 'friend');
  switch (await supportBot.askQuestion({ chatId: message.chat.id, question: \`Play a game?\`, timeout: "600" })) {
    case "Yes": {
      log(\`playing, name length \${length}\`);
      break;
    }
    case "No": {
      await supportBot.sendMessage({ chatId: message.chat.id, text: \`Maybe later.\` });
      break;
    }
    case TIMEOUT: {
      log(\`no answer\`);
      break;
    }
  }
});
`;

const GAME_TYPES = `interface GameState {
  celebrity: string;
  questions: int32;
  answers: string[];
}
`;

const NEW_GAME = `export async function newGame(): Promise<GameState> {
  return { celebrity: '', questions: 0, answers: [] };
}
`;

const START_GAME = `export default gameBot.onCommand({ command: "start_game" }, async (message: telegram.TelegramMessage): Promise<void> => {
  const state = await newGame();
  while (state.questions < 20) {
    const choice = await ai.callAiChoice({ model: "gpt-4o-mini", prompt: \`Answers so far: \${state.answers.join(', ')}\` });
    switch (choice.action) {
      case "ask": {
        const question = choice.data as string;
        state.questions = state.questions + 1;
        switch (await gameBot.askQuestion({ chatId: message.chat.id, question: \`\${question}\`, timeout: "10m" })) {
          case "Да": {
            state.answers.push(\`\${question}: да\`);
            break;
          }
          case "Нет": {
            state.answers.push(\`\${question}: нет\`);
            break;
          }
          case TIMEOUT: {
            return;
          }
        }
        break;
      }
      case "guess": {
        const name = choice.data as string;
        await gameBot.sendMessage({ chatId: message.chat.id, text: \`Это \${name}!\` });
        return;
      }
    }
  }
  const sorry = await ai.callAiText<string>({ model: "gpt-4o-mini", prompt: \`Apologise for giving up after \${state.questions} questions\` });
  await gameBot.sendMessage({ chatId: message.chat.id, text: \`\${sorry}\` });
});
`;

/** An empty project: instances are created with the integration tools, then types, a function and a trigger are written. */
const runFromScratch = async (): Promise<void> => {
  const store = new HeadlessWorkflowStore();
  const created: string[] = [];
  const client = new ScriptedLlmClient([
    toolCall('search_integrations', { keywords: ['telegram', 'ai'] }),
    toolCall('create_integration_instance', { name: 'Game bot', vendor: 'telegram' }),
    toolCall('create_integration_instance', { name: 'AI', vendor: 'openai' }),
    toolCall('write_file', { content: GAME_TYPES, path: 'types/GameTypes.ts' }),
    toolCall('write_file', { content: NEW_GAME, path: 'functions/newGame.ts' }),
    toolCall('write_file', { content: START_GAME, path: 'triggers/startGame.ts' }),
    toolCall('finish', { message: 'The game bot is ready.' }),
  ]);
  const session = createWorkflowAgentSession({ agentInterface: 'code', focusPauseMs: 0, llmClient: client, store });
  await session.run('Build the guess-the-celebrity bot.', { activeDocumentId: null });
  for (const step of session.steps) created.push(`${step.result.ok ? 'ok ' : 'ERR'} ${step.call.name}`);
  console.log(created.join('\n'));
  const failed = session.steps.filter((step) => !step.result.ok);
  assert(failed.length === 0, `scratch run failed: ${JSON.stringify(failed.map((step) => step.result))}`);
  const instanceStep = session.steps.find((step) => step.call.name === 'create_integration_instance');
  assert(
    instanceStep?.result.ok && instanceStep.result.content.includes('`gameBot`'),
    'create_integration_instance must name the code identifier',
  );
  const kinds = new Set<string>();
  const walk = (node: { name: string; children?: readonly unknown[] } | undefined): void => {
    if (!node) return;
    kinds.add(node.name);
    for (const child of node.children ?? []) walk(child as { name: string; children?: readonly unknown[] });
  };
  for (const doc of store.documents) if (doc.type !== 'integrations') walk(store.rootOf(doc));
  for (const kind of [
    'objects-structure-thread',
    'call-ai-choice',
    'call-ai-text',
    'telegram-question',
    'call-function',
  ]) {
    assert(kinds.has(kind), `expected a ${kind} node`);
  }
  compileAndTypeCheck(store);
  console.log(
    'ok   from an empty project: instances, types, function, trigger with AI choice/text and a question compile',
  );
  store.dispose();
};

/** compileProject + typeCheckProject over the store, attributed to documents — what a host passes as `checkProject`. */
const checkProjectOf =
  (store: HeadlessWorkflowStore) => (): Promise<{ documentId?: string; nodeId?: string; message: string }[]> => {
    try {
      compileAndTypeCheck(store);
      return Promise.resolve([]);
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      try {
        return Promise.resolve(
          JSON.parse(text.slice(text.indexOf('['))) as { documentId?: string; nodeId?: string; message: string }[],
        );
      } catch {
        return Promise.resolve([{ message: text }]);
      }
    }
  };

/** The projection accepts code the real compiler rejects (an int32 cast inside an expression): the write is undone. */
const runCompilerGate = async (): Promise<void> => {
  const store = new HeadlessWorkflowStore();
  const good = 'export async function total(x: number): Promise<number> {\n  return x + 1;\n}\n';
  const bad =
    'export async function total(x: number): Promise<number> {\n  const y = (x + 1) as int32;\n  return y;\n}\n';
  const client = new ScriptedLlmClient([
    toolCall('write_file', { content: good, path: 'functions/total.ts' }),
    toolCall('write_file', { content: bad, path: 'functions/total.ts' }),
    toolCall('finish', { message: 'done' }),
  ]);
  const session = createWorkflowAgentSession({
    agentInterface: 'code',
    checkProject: checkProjectOf(store),
    focusPauseMs: 0,
    llmClient: client,
    store,
  });
  await session.run('total', { activeDocumentId: null });
  const [first, second] = session.steps;
  assert(first?.result.ok, `the valid write failed: ${JSON.stringify(first?.result)}`);
  assert(
    second && !second.result.ok && /int32/.test(second.result.error) && /nothing was saved/.test(second.result.error),
    `the compiler gate did not reject: ${JSON.stringify(second?.result)}`,
  );
  const total = store.documents.find((doc) => doc.name === 'total');
  assert(
    total &&
      JSON.stringify(store.rootOf(total)).includes('x + 1') &&
      !JSON.stringify(store.rootOf(total)).includes('int32'),
    'the rejected write was not undone',
  );
  compileAndTypeCheck(store);
  console.log('ok   compiler gate: a write the real compiler rejects is undone and reported on its statement');
  store.dispose();
};

const main = async (): Promise<void> => {
  const store = new HeadlessWorkflowStore();
  store.saveIntegrationInstance({
    fields: { botToken: { dev: '', prod: '' } },
    id: 'inst-bot',
    name: 'Support bot',
    vendor: 'telegram',
  });
  const script: TScriptedStep[] = [
    toolCall('list_files', {}),
    toolCall('read_file', { path: 'vendors.d.ts' }),
    toolCall('write_file', { content: GREET, path: 'functions/greet.ts' }),
    toolCall('write_file', { content: START_BROKEN, path: 'triggers/start.ts' }),
    toolCall('write_file', {
      content: START_BROKEN.replace('timeout: "600"', 'timeout: "10m"'),
      path: 'triggers/start.ts',
    }),
    toolCall('edit_file', { new_string: 'Hello, ${name}!', old_string: 'Hi, ${name}!', path: 'functions/greet.ts' }),
    toolCall('finish', { message: 'Done: /start greets the user and asks to play.' }),
  ];
  const client = new ScriptedLlmClient(script);
  const session = createWorkflowAgentSession({ agentInterface: 'code', focusPauseMs: 0, llmClient: client, store });
  const greetRoot = () => store.rootOf(store.documents.find((doc) => doc.name === 'greet')!);
  await session.run('Make /start greet the user and ask whether they want to play.', { activeDocumentId: null });

  assert(session.status === 'done', `run ended ${session.status}: ${session.error}`);
  const results = session.steps.map((step) => [step.call.name, step.result.ok] as const);
  console.log(results.map(([name, ok]) => `${ok ? 'ok ' : 'ERR'} ${name}`).join('\n'));
  const failed = session.steps.filter((step) => !step.result.ok);
  assert(failed.length === 1, `exactly the "600" write should fail, got ${failed.length}`);
  const failure = failed[0]!.result;
  assert(
    !failure.ok && /triggers\/start\.ts:3:\d+ .*"600"/.test(failure.error),
    `type error not reported with file/line: ${JSON.stringify(failure)}`,
  );
  const toolNames = new Set(client.requests[0]?.tools.map((tool) => tool.name));
  assert(
    !toolNames.has('insert_nodes') && toolNames.has('write_file'),
    'code interface must offer file tools, not node tools',
  );

  const greet = store.documents.find((doc) => doc.name === 'greet');
  const start = store.documents.find((doc) => doc.name === 'start');
  assert(greet?.type === 'function' && start?.type === 'trigger-function', 'documents were not created');
  const startBody = store.rootOf(start).children?.[1];
  assert(
    startBody?.children?.some((node) => node.name === 'telegram-question'),
    'trigger body has no question node',
  );

  // The edit changed one node: rerun the same edit backwards and compare ids.
  const idsBeforeEdit = collectIds(greetRoot());
  const scheme = store.getScheme(greet.id);
  const history = resolveService(TOKEN_HISTORY, scheme.container);
  history.back();
  const afterUndo = collectIds(greetRoot());
  const text = JSON.stringify(greetRoot());
  assert(
    text.includes('Hi, ${name}!') && !text.includes('Hello, ${name}!'),
    'undo did not revert the edit as one step',
  );
  assert(
    [...idsBeforeEdit].every((id) => afterUndo.has(id)),
    'undo of an edit changed node ids',
  );
  history.forward();
  console.log('ok   one undo group per write, ids kept across edit + undo');

  const compiled = compileAndTypeCheck(store);
  assert(compiled.workflows.includes('Hello, ${name}!'), 'compiled output misses the edited text');
  console.log('ok   compile + type-check of the agent-written files');
  store.dispose();
  await runFromScratch();
  await runCompilerGate();
};

main().then(
  () => console.log('\nAll headless code-agent checks passed'),
  (error: unknown) => {
    console.error('FAIL', error);
    process.exitCode = 1;
  },
);
