// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import { describe, expect, it } from 'vitest';
import { projectFunctionFile, parseFunctionFile } from './function-file.js';
import { matchAndValidate } from './apply.js';
import { canonicalKey, collectIds } from './normalize.js';
import { fn, node, testContext, testStack } from './test-utils/context.js';
import { ProjectionError } from './types.js';

const int32 = { numberType: { integerType: 'int32', type: 'integer' }, type: 'number' } as const;

const sample = () =>
  fn(
    [
      node('comment', 'Count the players\nand greet them'),
      node('create-var', { name: 'total', value: '0', variableType: int32 }),
      node('create-var', { name: 'p', variableType: { id: 'struct-1', type: 'struct', optional: true } }),
      node('foreach', { arr: 'players', index: 'i', item: 'player' }, [
        node('if', 'player.score > 10', [
          node('if-child', undefined, [node('action', 'total += player.score')]),
          node('if-child', undefined, [node('log', 'skip ${player.name}\nnext `line`')]),
        ]),
      ]),
      node('while', 'total > 100', [node('action', 'total = total - 1')], { out: node('break') }),
      node('from-to-cycle', { from: '1', item: 'k', to: '3' }, [
        node('arr-push', { arr: 'names', value: 'String(k)' }),
      ]),
      node('switch', 'total', [
        node('switch-option', '1', [node('action', 'total = 2')]),
        node('switch-option', '2', [], { out: node('return', '5') }),
      ]),
      node('pseudo-cycle', undefined, [
        node('call-function', { iconId: null, parameters: ['total'], returnVariable: 'r', schemeId: 'doc-h' }),
      ]),
      node('arr-pop', { arr: 'names', variable: 'last' }),
      node('action', 'const x = 1'),
      node('return', 'total'),
    ],
    {
      parameters: [
        { name: 'players', type: { elementType: { id: 'struct-1', type: 'struct' }, dimensions: 1, type: 'array' } },
        { name: 'names', type: { elementType: { type: 'string' }, dimensions: 1, type: 'array' } },
      ],
      returnValue: int32,
    },
    'Scores the round',
  );

describe('function file projection', () => {
  const ctx = testContext([{ id: 'doc-h', name: 'helper' }]);

  it('projects readable TypeScript', () => {
    const text = projectFunctionFile(sample(), 'score', ctx);
    expect(text).toMatchInlineSnapshot(`
      "/**
       * Scores the round
       */
      export async function score(players: Player[], names: string[]): Promise<int32> {
        // Count the players
        // and greet them
        let total: int32 = 0;
        let p: Player | undefined;
        for (const [i, player] of players.entries()) {
          if (player.score > 10) {
            total += player.score;
          } else {
            log(\`skip \${player.name}
            next \\\`line\\\`\`);
          }
        }
        while (total > 100) {
          total = total - 1;
          break;
        }
        for (let k = 1; k <= 3; k++) {
          names.push(String(k));
        }
        switch (total) {
          case 1: {
            total = 2;
            break;
          }
          case 2: {
            return 5;
          }
        }
        while (true) {
          const r = await helper(total);
          break;
        }
        const last = names.pop();
        /*@action*/ const x = 1;
        return total;
      }
      "
    `);
  });

  it('round-trips structure, data and ids for an unchanged file', () => {
    const root = sample();
    const text = projectFunctionFile(root, 'score', ctx);
    const parsed = parseFunctionFile(text, 'functions/score.ts', 'score', ctx);
    expect(canonicalKey(parsed)).toBe(canonicalKey(root));
    const { root: matched } = matchAndValidate(root, parsed, testStack, {
      file: 'functions/score.ts',
      id: 'd',
      name: 'score',
    });
    expect(matched).toEqual(root);
    expect(collectIds(matched)).toEqual(collectIds(root));
  });

  it('reports unsupported constructs with file and line', () => {
    const text = 'export async function score(): Promise<void> {\n  try {\n    a();\n  } catch {}\n}\n';
    expect(() => parseFunctionFile(text, 'functions/score.ts', 'score', ctx)).toThrow(ProjectionError);
    try {
      parseFunctionFile(text, 'functions/score.ts', 'score', ctx);
    } catch (error) {
      expect((error as ProjectionError).diagnostics[0]).toMatchObject({ file: 'functions/score.ts', line: 2 });
    }
  });
});
