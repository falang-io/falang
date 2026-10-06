// oxlint-disable no-undefined, init-declarations, max-classes-per-file, no-map-spread, no-array-callback-reference, catch-error-name, prefer-string-raw, max-lines, no-console -- spike code (ADR 0061 (private))
import { ProjectionError } from '@falang/code-projection';
import { describe, expect, it } from 'vitest';
import { WorkflowProjection } from './workflow-projection.js';
import { commandTriggerData, functionRoot, n, project, triggerRoot } from './test-utils/project.js';

const num = { numberType: { type: 'any' }, type: 'number' } as const;

const gameTypes = n('objects-structure', undefined, [
  n('objects-structure-header', ''),
  n('objects-structure-body', null, [
    {
      children: [n('objects-structure-child', { name: 'score', variableType: num })],
      data: 'GameState',
      id: 'struct-game',
      name: 'objects-structure-thread',
    },
  ]),
]);

const input = () =>
  project([
    {
      id: 'doc-double',
      name: 'double',
      root: functionRoot([n('return', 'x * 2')], { parameters: [{ name: 'x', type: num }], returnValue: num }),
      type: 'function',
    },
    { id: 'doc-start', name: 'start', root: triggerRoot([], commandTriggerData), type: 'trigger-function' },
    { id: 'doc-types', name: 'GameTypes', root: gameTypes, type: 'objects-structure' },
  ]);

const fn = (signature: string, body: string): string => `export async function ${signature} {\n${body}\n}\n`;
const trigger = (body: string): string =>
  `export default supportBot.onCommand({ command: "/start" }, async (message: telegram.TelegramMessage): Promise<void> => {\n${body}\n});\n`;

interface ICase {
  readonly title: string;
  readonly path: string;
  readonly code: string;
  /** Expected message fragment, or `null` when the write must succeed (a normalisation, not an error). */
  readonly expect: RegExp | null;
  /** 1-based line the first diagnostic must point at. */
  readonly line?: number;
}

const CASES: readonly ICase[] = [
  {
    code: fn('total(): Promise<void>', '  return 5;'),
    expect: /not assignable to type 'void'/,
    line: 2,
    path: 'functions/total.ts',
    title: 'non-void value returned from a void function (tuner: first-child-out)',
  },
  {
    code: fn('total(): Promise<number>', '  const y = await tripple(2);\n  return y;'),
    expect: /Cannot find name 'tripple'/,
    line: 2,
    path: 'functions/total.ts',
    title: 'call to a function that does not exist',
  },
  {
    code: trigger(
      '  switch (await supportBot.askQuestion({ chatId: message.chat.id, question: `Ready?`, timeout: "600" })) {\n    case "Yes": {\n      break;\n    }\n  }',
    ),
    expect: /"600".*not assignable/,
    line: 2,
    path: 'triggers/start.ts',
    title: 'duration "600" without a unit (tuner: yes/no buttons)',
  },
  {
    code: trigger('  await supportBot.sendMessage({ chatId: "${message.chat.id}", text: `Hi` });'),
    expect: /not assignable to type 'number'/,
    line: 2,
    path: 'triggers/start.ts',
    title: '`${…}` / a string where an expression is expected (tuner: templated fields)',
  },
  {
    code: trigger('  await supportBot.sendMesage({ chatId: message.chat.id, text: `Hi` });'),
    expect: /sendMesage.*(Did you mean|not a method)/,
    line: 2,
    path: 'triggers/start.ts',
    title: 'misspelled integration method',
  },
  {
    code: trigger('  await supportBot.sendMessage({ text: `Hi` });'),
    expect: /chatId.*missing/,
    line: 2,
    path: 'triggers/start.ts',
    title: 'required integration parameter missing',
  },
  {
    code: trigger('  await supportBot.sendMessage({ chat: message.chat.id, text: `Hi` });'),
    expect: /Unknown parameter `chat`/,
    line: 2,
    path: 'triggers/start.ts',
    title: 'unknown integration parameter',
  },
  {
    code: trigger('  log(`${message.chat.idd}`);'),
    expect: /Property 'idd' does not exist/,
    line: 2,
    path: 'triggers/start.ts',
    title: 'typo in a payload property',
  },
  {
    code: fn('total(): Promise<void>', '  try {\n    log(`x`);\n  } catch {}'),
    expect: /try\/catch is not supported/,
    line: 2,
    path: 'functions/total.ts',
    title: 'unsupported `try`',
  },
  {
    code: fn('total(): Promise<void>', '  for (let i = 0; i < 3; i++) {\n    log(`${i}`);\n  }'),
    expect: /Only the counting loop `for \(let i = from; i <= to; i\+\+\)/,
    line: 2,
    path: 'functions/total.ts',
    title: '`for` loop not of the `i <= to` form',
  },
  {
    code: fn(
      'total(x: number): Promise<void>',
      '  switch (x) {\n    case 1: {\n      log(`one`);\n    }\n    case 2: {\n      break;\n    }\n  }',
    ),
    expect: /must end with `break;`/,
    line: 3,
    path: 'functions/total.ts',
    title: 'switch fall-through',
  },
  {
    code: fn(
      'total(x: number): Promise<void>',
      '  while (true) {\n    switch (x) {\n      case 1: {\n        if (x > 0) {\n          break;\n        }\n        log(`a`);\n        break;\n      }\n    }\n  }',
    ),
    expect: /bare `break;` inside a case/,
    line: 6,
    path: 'functions/total.ts',
    title: 'bare `break` in a case meant to leave the loop',
  },
  {
    code: trigger(
      '  switch (await supportBot.askQuestion({ chatId: message.chat.id, question: `?` })) {\n    default: {\n      break;\n    }\n  }',
    ),
    expect: /no `default:` branch/,
    line: 3,
    path: 'triggers/start.ts',
    title: '`default:` in a question',
  },
  {
    code: `import { x } from './other';\n${fn('total(): Promise<void>', '  log(`x`);')}`,
    expect: /No imports/,
    line: 1,
    path: 'functions/total.ts',
    title: '`import`',
  },
  {
    code: fn('total(): Promise<void>', '  const r = await fetch("https://example.com");'),
    expect: /Cannot find name 'fetch'.*integration/,
    line: 2,
    path: 'functions/total.ts',
    title: '`fetch` (no network outside integrations)',
  },
  {
    code: fn('total(): Promise<void>', '  console.log("hi");'),
    expect: /Cannot find name 'console'.*log\(/,
    line: 2,
    path: 'functions/total.ts',
    title: '`console.log`',
  },
  {
    code: fn('total(): Promise<void>', '  function inner() {}\n  inner();'),
    expect: /Nested functions/,
    line: 2,
    path: 'functions/total.ts',
    title: 'nested function declaration',
  },
  {
    code: fn('wrongName(): Promise<void>', '  log(`x`);'),
    expect: /must be named `total`/,
    line: 1,
    path: 'functions/total.ts',
    title: 'function name differs from the file name',
  },
  {
    code: 'declare const x: number;\n',
    expect: /generated and read-only/,
    path: 'vendors.d.ts',
    title: 'writing a generated file',
  },
  {
    code: fn('Total(): Promise<void>', '  log(`x`);'),
    expect: /not a valid name/,
    path: 'functions/Total.ts',
    title: 'non-camelCase (or non-Latin) function name',
  },
  {
    code: fn('total(): Promise<void>', '  const s: GameState = { score: "high" };'),
    expect: /not assignable to type 'number'/,
    line: 2,
    path: 'functions/total.ts',
    title: 'wrong property type in a project struct',
  },
  {
    code: fn('total(): Promise<number>', '  const y = await double("2");\n  return y;'),
    expect: /not assignable to parameter of type 'number'/,
    line: 2,
    path: 'functions/total.ts',
    title: 'wrong argument type to a project function',
  },
  {
    code: fn('total(): Promise<void>', '  log(`${later}`);\n  let later: number = 1;'),
    expect: /used before its declaration/,
    line: 2,
    path: 'functions/total.ts',
    title: 'variable used before it is declared',
  },
  {
    code: fn('total(): Promise<void>', '  do {\n    log(`x`);\n  } while (false);'),
    expect: /do…while is not supported/,
    line: 2,
    path: 'functions/total.ts',
    title: '`do … while`',
  },
  {
    code: trigger('  const reply = String(await supportBot.sendMessage({ chatId: message.chat.id, text: `Hi` }));'),
    expect: /can only be called as a statement of its own/,
    line: 2,
    path: 'triggers/start.ts',
    title: 'integration call nested in an expression (tuner: guess-celebrity)',
  },
  {
    code: trigger('  let sent = 0;\n  sent = await supportBot.sendMessage({ chatId: message.chat.id, text: `Hi` });'),
    expect: /can only be called as a statement of its own/,
    line: 3,
    path: 'triggers/start.ts',
    title: 'integration call result assigned to an existing variable',
  },
  // Normalisations: valid code the tree can't hold literally — accepted and rewritten (G4).
  {
    code: fn(
      'total(x: number): Promise<number>',
      '  if (x > 1) {\n    return 1;\n  } else {\n    log(`small`);\n  }\n  return 0;',
    ),
    expect: null,
    path: 'functions/total.ts',
    title: 'first branch ends in `return` → branches swapped, `trueOnRight` set',
  },
  {
    code: fn('total(): Promise<void>', '  while (true) {\n    break;\n  }'),
    expect: null,
    path: 'functions/total.ts',
    title: '`break` as the first statement of a loop body → plain last statement, no `out` error',
  },
  {
    code: trigger("  await supportBot.sendMessage({ chatId: message.chat.id, text: 'Hi ${message.chat.id}' });"),
    expect: null,
    path: 'triggers/start.ts',
    title: "template field written as a quoted string `'Hi ${…}'` → interpolates (field body)",
  },
  {
    code: fn('total(): Promise<void>', '  const n = await double(2);\n  let m = n + 1;\n  log(`${m}`);'),
    expect: null,
    path: 'functions/total.ts',
    title: 'declaration without a type annotation → type inferred by the checker',
  },
];

describe('G3: typical mistakes come back with file, line and a fix', () => {
  it.each(CASES)('$title', (testCase) => {
    const projection = new WorkflowProjection(input());
    if (testCase.expect === null) {
      expect(() => projection.writeFile(testCase.path, testCase.code)).not.toThrow();
      return;
    }
    let error: unknown;
    try {
      projection.writeFile(testCase.path, testCase.code);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(ProjectionError);
    const diagnostics = (error as ProjectionError).diagnostics;
    expect(diagnostics.map((d) => d.message).join('\n')).toMatch(testCase.expect);
    expect(diagnostics[0]?.file).toBe(testCase.path);
    if (testCase.line !== undefined) expect(diagnostics[0]?.line).toBe(testCase.line);
  });

  it('prints the table', () => {
    const rows = CASES.map((testCase) => {
      const projection = new WorkflowProjection(input());
      try {
        projection.writeFile(testCase.path, testCase.code);
        return `| ${testCase.title} | accepted | — |`;
      } catch (error) {
        const first = (error as ProjectionError).diagnostics[0];
        const message = (first?.message ?? String(error)).replaceAll('|', '\\|').replaceAll('\n', ' ');
        return `| ${testCase.title} | ${first?.file}:${first?.line}:${first?.column} | ${message} |`;
      }
    });
    console.log(['| mistake | reported at | message |', '| --- | --- | --- |', ...rows].join('\n'));
    expect(rows.length).toBeGreaterThanOrEqual(15);
  });
});
