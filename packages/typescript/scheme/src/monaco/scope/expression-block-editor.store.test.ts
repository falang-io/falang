import { container as rootContainer, resolveService } from '@falang/di';
import { NodeStore, type IBlockEditorFactoryParams, type IconStore } from '@falang/scheme';
import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import { registerTypescriptProjectService } from '../../typescript-project-service/register-typescript-project-service.js';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import { ExpressionBlockEditorStore } from './expression-block-editor.store.js';

/** Minimal concrete subclass — `ExpressionBlockEditorStore` is abstract only because `BlockEditorStore` is. */
class TestExpressionBlockEditorStore extends ExpressionBlockEditorStore<string> {
  getData(): string {
    return this.initialData;
  }
}

const makeNode = (node: INode, parent: NodeStore | null = null): NodeStore => {
  const store = new NodeStore(node);
  store.parent = parent;
  const children = (node.children ?? []).map((child) => makeNode(child, store));
  store.children.replace(children);
  return store;
};

/**
 * Builds `function-body → [call-function, action]` and returns the `action` `NodeStore` — the
 * position whose scope should (or shouldn't) see the call-function's `returnVariable`.
 */
const buildActionAfterCallFunction = (callFunctionData: { schemeId: string; returnVariable: string }): NodeStore => {
  const callFunction: INode = {
    id: 'call',
    name: 'call-function',
    data: {
      schemeId: callFunctionData.schemeId,
      iconId: null,
      parameters: [],
      returnVariable: callFunctionData.returnVariable,
    },
  };
  const action: INode = { id: 'current', name: 'action', data: '' };
  const functionBody: INode = {
    id: 'body',
    name: 'function-body',
    children: [callFunction, action],
    data: { name: 'fn', parameters: [] },
  };
  const functionNode: INode = { id: 'fn', name: 'function', children: [functionBody] };

  const functionStore = makeNode(functionNode);
  const bodyStore = functionStore.children.find((child) => child.name === 'function-body');
  const actionStore = bodyStore?.children.find((child) => child.name === 'action');
  if (!actionStore) throw new Error('test setup failed');
  return actionStore;
};

const buildParams = (dataNode: NodeStore): IBlockEditorFactoryParams<string> => {
  const container = rootContainer.createChildContainer();
  registerTypescriptProjectService(container);
  return {
    container,
    data: '',
    // `ExpressionBlockEditorStore` only ever reads `icon.dataNode` — a real `IconStore` needs a full
    // node-config/shape/geometry setup unrelated to this test, so a minimal duck-typed stand-in is
    // used instead (same spirit as `collect-scope-variables.test.ts`'s hand-built `NodeStore` trees).
    icon: { dataNode } as unknown as IconStore,
  };
};

describe('ExpressionBlockEditorStore.hiddenScopeCode', () => {
  it("includes a call-function's returnVariable when the target function returns a non-void type", () => {
    const actionNode = buildActionAfterCallFunction({ schemeId: 'target-fn', returnVariable: 'sum' });
    const params = buildParams(actionNode);
    const projectService = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, params.container);
    projectService.functionsRegistry.setFunction({
      schemeId: 'target-fn',
      name: 'add',
      parameters: [],
      returnValue: { type: 'number', numberType: { type: 'any' } },
    });

    const store = new TestExpressionBlockEditorStore(params);

    expect(store.hiddenScopeCode).toContain('declare var sum: number;');
  });

  it('omits returnVariable when the target function returns void', () => {
    const actionNode = buildActionAfterCallFunction({ schemeId: 'target-fn', returnVariable: 'sum' });
    const params = buildParams(actionNode);
    const projectService = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, params.container);
    projectService.functionsRegistry.setFunction({
      schemeId: 'target-fn',
      name: 'doStuff',
      parameters: [],
      // no `returnValue` — a void function, same convention `getFunctionSignature` (`@falang/logic-constructor`) uses.
    });

    const store = new TestExpressionBlockEditorStore(params);

    expect(store.hiddenScopeCode).not.toContain('sum');
  });

  it('omits returnVariable when it is blank, even for a non-void target function', () => {
    const actionNode = buildActionAfterCallFunction({ schemeId: 'target-fn', returnVariable: '' });
    const params = buildParams(actionNode);
    const projectService = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, params.container);
    projectService.functionsRegistry.setFunction({
      schemeId: 'target-fn',
      name: 'add',
      parameters: [],
      returnValue: { type: 'number', numberType: { type: 'any' } },
    });

    const store = new TestExpressionBlockEditorStore(params);

    expect(store.hiddenScopeCode).toBe('');
  });
});
