// oxlint-disable no-undefined, init-declarations, complexity, no-use-before-define, max-lines, max-depth, no-nested-ternary, no-bitwise, max-classes-per-file, no-dynamic-delete, no-map-spread, branches-sharing-code, prefer-ternary, no-empty-function, no-non-null-assertion, no-object-as-default-parameter, consistent-function-scoping, no-useless-collection-argument, no-console -- spike code (ADR 0061 (private))
import { commentCfg, NodesGroup, NodesStack, type INode } from '@falang/dto';
import { functionNodesGroup } from '@falang/typescript-dto';
import { createFunctionNames, createTypeNames } from '../simple-registries.js';
import type { IProjectionContext } from '../types.js';

export const testStack = new NodesStack([functionNodesGroup, new NodesGroup([commentCfg()])]);

export const testContext = (functions: readonly { id: string; name: string }[] = []): IProjectionContext => ({
  functions: createFunctionNames(functions),
  stack: testStack,
  types: createTypeNames(new Map([['struct-1', 'Player']])),
});

let counter = 0;
const id = (): string => {
  counter += 1;
  return `n${counter}`;
};

export const fn = (body: INode[], data: Record<string, unknown> = { parameters: [] }, header = ''): INode => ({
  children: [
    { data: header, id: id(), name: 'function-header' },
    { children: body, data, id: id(), name: 'function-body' },
    { data: '', id: id(), name: 'function-footer' },
  ],
  id: id(),
  name: 'function',
});

export const node = (name: string, data?: unknown, children?: INode[], extra: Partial<INode> = {}): INode => ({
  id: id(),
  name,
  ...(data === undefined ? {} : { data }),
  ...(children ? { children } : {}),
  ...extra,
});
