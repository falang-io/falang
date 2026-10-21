// oxlint-disable no-explicit-any, no-void, no-undefined, no-useless-undefined, no-inline-comments
import { container as rootContainer, resolveService } from '@falang/di';
import { NodesStack } from '@falang/dto';
import {
  CMD_INSERT_NODE,
  registerGlobalTokens,
  TOKEN_VALIDATION_STORE,
  ValidationModule,
  ValidationQueue,
  type Scheme,
} from '@falang/scheme';
import { functionNodesGroup } from '@falang/typescript-dto';
import { afterEach, describe, expect, it } from 'vitest';
import { functionalSchemeFactory } from '../functional.js';
import { registerTypescriptProjectService } from '../typescript-project-service/register-typescript-project-service.js';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../typescript-project-service/typescript-project.service.token.js';
import { createPortableTypesValidator, findPortableTypeProblems } from './portable-types-validator.js';

const numberAny = { type: 'number', numberType: { type: 'any' } };

describe('findPortableTypeProblems', () => {
  it('finds number(any), any and enum at any depth, once per field and problem', () => {
    expect(
      findPortableTypeProblems({
        name: 'x',
        variableType: { type: 'array', elementType: numberAny, dimensions: 1 },
        parameters: [
          { name: 'a', type: numberAny },
          { name: 'b', type: numberAny },
          { name: 'c', type: { type: 'any' } },
        ],
        returnValue: { type: 'union', unionTypes: [{ type: 'enum', schemeId: 's', iconId: 'i' }] },
      }),
    ).toEqual([
      { field: 'variableType', problem: 'number-any' },
      { field: 'parameters', problem: 'number-any' },
      { field: 'parameters', problem: 'any' },
      { field: 'returnValue', problem: 'enum' },
    ]);
  });

  it('accepts concrete number kinds and unrelated objects with a `type` key', () => {
    expect(
      findPortableTypeProblems({
        variableType: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } },
        other: { type: 'any', extra: 1 },
        text: 'number',
      }),
    ).toEqual([]);
  });
});

const build = (portable: boolean) => {
  registerGlobalTokens();
  const container = rootContainer.createChildContainer();
  registerTypescriptProjectService(container);
  if (portable) resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, container).setNumberTypesMode('portable');
  const queue = new ValidationQueue({ schedule: (fn) => void Promise.resolve().then(fn) });
  const scheme: Scheme = functionalSchemeFactory({
    parentContainer: container,
    extraModules: [new ValidationModule({ validators: [createPortableTypesValidator() as any], queue })],
    document: {
      id: 'd',
      type: 'function',
      name: 'doc',
      root: new NodesStack([functionNodesGroup]).factory('function'),
    },
  });
  const body = scheme.rootNode?.children[1];
  if (!body) throw new Error('no body');
  const add = (id: string, data: unknown) => {
    const node = scheme.infra.structure.factory('create-var');
    Object.assign(node, { id, data });
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: 0, parentId: body.id, node });
  };
  return { scheme, queue, add, store: resolveService(TOKEN_VALIDATION_STORE, scheme.container) };
};

describe('portable types validator', () => {
  let scheme: Scheme | null = null;
  afterEach(() => scheme?.dispose());

  it('marks a number(any) variable with an error in portable mode', async () => {
    const t = build(true);
    scheme = t.scheme;
    t.add('v', { name: 'x', variableType: numberAny });
    await t.queue.idle();
    expect(t.store.issuesFor('v')).toMatchObject([
      { field: 'variableType', severity: 'error', source: 'portable-types' },
    ]);
    expect(t.store.issuesFor('v')[0].message).toContain('integer, float or decimal');
    expect(t.store.errorCount).toBe(1);
  });

  it('is silent for a concrete number kind', async () => {
    const t = build(true);
    scheme = t.scheme;
    t.add('v', {
      name: 'x',
      variableType: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } },
    });
    await t.queue.idle();
    expect(t.store.errorCount).toBe(0);
  });

  it('is off in typescript mode', async () => {
    const t = build(false);
    scheme = t.scheme;
    t.add('v', { name: 'x', variableType: numberAny });
    await t.queue.idle();
    expect(t.store.errorCount).toBe(0);
  });
});
