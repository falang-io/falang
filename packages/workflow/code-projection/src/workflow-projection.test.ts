// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import { canonicalKey, collectIds, ProjectionError } from '@falang/code-projection';
import { describe, expect, it } from 'vitest';
import { WorkflowProjection } from './workflow-projection.js';
import { commandTriggerData, functionRoot, n, project, triggerRoot } from './test-utils/project.js';

const greet = () =>
  functionRoot(
    [
      n('telegram-send-message', { chatId: 'chatId', credentialId: 'inst-bot', text: 'Hello, ${name}!' }),
      n('return', 'name.length'),
    ],
    {
      parameters: [
        { name: 'chatId', type: { numberType: { type: 'any' }, type: 'number' } },
        { name: 'name', type: { type: 'string' } },
      ],
      returnValue: { numberType: { type: 'any' }, type: 'number' },
    },
  );

const start = () =>
  triggerRoot(
    [
      n('call-function', {
        iconId: null,
        parameters: ['message.chat.id', "message.from?.firstName ?? ''"],
        returnVariable: 'len',
        schemeId: 'doc-greet',
      }),
      n(
        'telegram-question',
        {
          chatId: 'message.chat.id',
          credentialId: 'inst-bot',
          options: ['Yes', 'No'],
          question: 'Ready, ${message.chat.id}?',
          timeout: '10m',
        },
        [
          n('telegram-question-option', { label: 'Yes' }, [n('log', 'yes ${len}')]),
          n('telegram-question-option', { label: 'No' }, [n('action', 'return')]),
          n('telegram-question-option', { fixed: true, label: 'timeout' }, [n('log', 'timed out')]),
        ],
      ),
    ],
    commandTriggerData,
  );

const input = () =>
  project([
    { id: 'doc-greet', name: 'greet', root: greet(), type: 'function' },
    { id: 'doc-start', name: 'start', root: start(), type: 'trigger-function' },
  ]);

describe('WorkflowProjection', () => {
  it('lists and reads files', () => {
    const projection = new WorkflowProjection(input());
    expect(projection.listFiles().map((file) => file.path)).toEqual([
      'falang.d.ts',
      'vendors.d.ts',
      'integrations.ts',
      'functions/greet.ts',
      'triggers/start.ts',
    ]);
    expect(projection.readFile('integrations.ts')).toContain('declare const supportBot: telegram.Instance;');
    expect(projection.readFile('integrations.ts')).toContain('declare const moyGpt: openai.Instance;');
    expect(projection.readFile('functions/greet.ts')).toMatchInlineSnapshot(`
      "export async function greet(chatId: number, name: string): Promise<number> {
        await supportBot.sendMessage({ chatId: chatId, text: \`Hello, \${name}!\` });
        return name.length;
      }
      "
    `);
    expect(projection.readFile('triggers/start.ts')).toMatchInlineSnapshot(`
      "export default supportBot.onCommand({ command: "/start" }, async (message: telegram.TelegramMessage): Promise<void> => {
        const len = await greet(message.chat.id, message.from?.firstName ?? '');
        switch (await supportBot.askQuestion({
          chatId: message.chat.id,
          question: \`Ready, \${message.chat.id}?\`,
          timeout: "10m",
        })) {
          case "Yes": {
            log(\`yes \${len}\`);
            break;
          }
          case "No": {
            /*@action*/ return;
            break;
          }
          case TIMEOUT: {
            log(\`timed out\`);
            break;
          }
        }
      });
      "
    `);
  });

  it('unchanged files write back to the same trees, ids kept', () => {
    const data = input();
    const projection = new WorkflowProjection(data);
    for (const doc of data.documents) {
      const path = doc.type === 'function' ? `functions/${doc.name}.ts` : `triggers/${doc.name}.ts`;
      const started = performance.now();
      const result = projection.writeFile(path, projection.readFile(path));
      // oxlint-disable-next-line no-console
      console.log(`${path}: write pipeline ${Math.round(performance.now() - started)} ms`);
      expect(canonicalKey(result.root)).toBe(canonicalKey(doc.root!));
      expect(collectIds(result.root)).toEqual(collectIds(doc.root!));
      expect(result.stats.fresh).toBe(0);
    }
  });

  it('rejects a type error with file and line', () => {
    const projection = new WorkflowProjection(input());
    const text = projection.readFile('functions/greet.ts').replace('chatId: chatId', 'chatId: "600"');
    expect(() => projection.writeFile('functions/greet.ts', text)).toThrow(ProjectionError);
  });
});
