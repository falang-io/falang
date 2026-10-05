// oxlint-disable no-undefined, no-non-null-assertion -- spike tests (ADR 0061 (private))
import { canonicalKey, collectIds, ProjectionError } from '@falang/code-projection';
import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { WorkflowProjection } from './workflow-projection.js';
import { functionRoot, n, project } from './test-utils/project.js';

const num = { numberType: { type: 'any' }, type: 'number' } as const;

const gameTypes = (): INode =>
  n('objects-structure', undefined, [
    n('objects-structure-header', ''),
    n('objects-structure-body', null, [
      {
        children: [
          {
            children: [],
            data: { name: 'celebrity', variableType: { type: 'string' } },
            id: 'p-celebrity',
            name: 'objects-structure-child',
          },
          {
            children: [],
            data: { name: 'questions', variableType: num },
            id: 'p-questions',
            name: 'objects-structure-child',
          },
        ],
        data: 'GameState',
        id: 'struct-game',
        name: 'objects-structure-thread',
      },
    ]),
  ]);

const newGame = (): INode =>
  functionRoot([n('return', "{ celebrity: '', questions: 0 }")], {
    parameters: [],
    returnValue: { id: 'struct-game', type: 'struct' },
  });

describe('types files (objects-structure)', () => {
  const input = () =>
    project([
      { id: 'doc-types', name: 'GameTypes', root: gameTypes(), type: 'objects-structure' },
      { id: 'doc-new', name: 'newGame', root: newGame(), type: 'function' },
    ]);

  it('projects interfaces and writes them back with the same ids', () => {
    const projection = new WorkflowProjection(input());
    const text = projection.readFile('types/GameTypes.ts');
    expect(text).toBe('interface GameState {\n  celebrity: string;\n  questions: number;\n}\n');
    const { root } = projection.writeFile('types/GameTypes.ts', text);
    expect(canonicalKey(root)).toBe(canonicalKey(gameTypes()));
    expect([...collectIds(root)].filter((id) => !id.startsWith('w'))).toEqual([
      'struct-game',
      'p-celebrity',
      'p-questions',
    ]);
    expect(projection.readFile('functions/newGame.ts')).toContain('Promise<GameState>');
  });

  it('keeps the thread id when properties change; a new interface gets a new id; other files see it', () => {
    const projection = new WorkflowProjection(input());
    const text =
      'interface GameState {\n  celebrity: string;\n  questions: number;\n  answers?: string[];\n}\n\ninterface Answer {\n  question: string;\n  yes: boolean;\n}\n';
    const { root } = projection.writeFile('types/GameTypes.ts', text);
    const threads = root.children?.[1]?.children ?? [];
    expect(threads.map((thread) => [thread.id === 'struct-game', thread.data])).toEqual([
      [true, 'GameState'],
      [false, 'Answer'],
    ]);
    expect(threads[0]?.children?.map((child) => child.id).slice(0, 2)).toEqual(['p-celebrity', 'p-questions']);
  });

  it('refuses to drop an interface another document uses, and a type error in a property', () => {
    const projection = new WorkflowProjection(input());
    expect(() => projection.writeFile('types/GameTypes.ts', 'interface Other {\n  a: string;\n}\n')).toThrow(
      /still used by newGame/,
    );
    expect(() => projection.writeFile('types/GameTypes.ts', 'interface GameState {\n  a: Missing;\n}\n')).toThrow(
      ProjectionError,
    );
  });

  it('a new types file is a new document', () => {
    const projection = new WorkflowProjection(input());
    const result = projection.writeFile('types/Scores.ts', 'interface Score {\n  points: number;\n}\n');
    expect(result.documentId).toBeUndefined();
    expect(result.type).toBe('objects-structure');
  });
});

describe('AI actions', () => {
  const aiProject = (body: INode[]) =>
    project([
      {
        id: 'doc-ai',
        name: 'decide',
        root: functionRoot(body, { parameters: [{ name: 'q', type: { type: 'string' } }] }),
        type: 'function',
      },
    ]);

  it('call-ai-text with a result type round-trips', () => {
    const body = [
      n('call-ai-text', {
        attachments: '',
        integration: 'inst-gpt',
        model: 'gpt-4o-mini',
        prompt: 'Answer: ${q}',
        result: JSON.stringify({ type: 'string' }),
        resultVariable: 'answer',
      }),
      n('log', '${answer}'),
    ];
    const data = aiProject(body);
    const projection = new WorkflowProjection(data);
    const text = projection.readFile('functions/decide.ts');
    expect(text).toContain(
      'const answer = await moyGpt.callAiText<string>({ model: "gpt-4o-mini", prompt: `Answer: ${q}` });',
    );
    const { root } = projection.writeFile('functions/decide.ts', text);
    expect(canonicalKey(root)).toBe(canonicalKey(data.documents[0]!.root!));
  });

  it('call-ai-choice is `const choice = …; switch (choice.action)` and round-trips with typed data', () => {
    const options = [
      { alias: 'ask', dataType: { type: 'string' }, variable: 'question' },
      { alias: 'guess', dataType: { type: 'string' }, variable: 'name' },
    ];
    const body = [
      n(
        'call-ai-choice',
        { attachments: '', integration: 'inst-gpt', model: 'gpt-4o-mini', options, prompt: 'Play: ${q}' },
        [
          n('call-ai-choice-option', options[0], [n('log', 'ask ${question}')]),
          n('call-ai-choice-option', options[1], [n('log', 'guess ${name}')]),
        ],
      ),
    ];
    const data = aiProject(body);
    const projection = new WorkflowProjection(data);
    const text = projection.readFile('functions/decide.ts');
    expect(text).toContain('const choice = await moyGpt.callAiChoice(');
    expect(text).toContain('switch (choice.action) {');
    expect(text).toContain('const question = choice.data as string;');
    const { root } = projection.writeFile('functions/decide.ts', text);
    expect(canonicalKey(root)).toBe(canonicalKey(data.documents[0]!.root!));
    expect(collectIds(root)).toEqual(collectIds(data.documents[0]!.root!));
  });

  it('a choice result must be switched on right away', () => {
    const projection = new WorkflowProjection(aiProject([]));
    const text =
      'export async function decide(q: string): Promise<void> {\n  const choice = await moyGpt.callAiChoice({ model: "m", prompt: `x` });\n  log(`no switch`);\n}\n';
    expect(() => projection.writeFile('functions/decide.ts', text)).toThrow(/switch \(choice\.action\)/);
  });
});
