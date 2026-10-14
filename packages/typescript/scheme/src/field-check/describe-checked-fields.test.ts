// oxlint-disable no-explicit-any, no-undefined, no-useless-undefined, no-inline-comments
import { container as rootContainer, resolveService } from '@falang/di';
import type { INode } from '@falang/dto';
import { NodeStore, type IBlockEditorFactoryParams, type IconStore } from '@falang/scheme';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActionEditorStore } from '../blocks/action/action-editor.store.js';
import { ArrInsertBlockEditorStore } from '../blocks/arr-insert/arr-insert-editor.store.js';
import { ArrOpInputBlockEditorStore } from '../blocks/arr-op-input/arr-op-input-editor.store.js';
import { ArrOpReturningBlockEditorStore } from '../blocks/arr-op-returning/arr-op-returning-editor.store.js';
import { ArrSliceBlockEditorStore } from '../blocks/arr-slice/arr-slice-editor.store.js';
import { CallApiBlockEditorStore } from '../blocks/call-api/call-api-editor.store.js';
import { CallFunctionBlockEditorStore } from '../blocks/call-function/call-function-editor.store.js';
import { CreateVarBlockEditorStore } from '../blocks/create-var/create-var-editor.store.js';
import { ExpressionEditorStore } from '../blocks/expression/expression-editor.store.js';
import { ForeachHeaderBlockEditorStore } from '../blocks/foreach-header/foreach-header-editor.store.js';
import { FromToCycleHeaderBlockEditorStore } from '../blocks/from-to-cycle-header/from-to-cycle-header-editor.store.js';
import { IfEditorStore } from '../blocks/if/if-editor.store.js';
import { LogBlockEditorStore } from '../blocks/log/log-editor.store.js';
import { ReturnEditorStore } from '../blocks/return/return-editor.store.js';
import { registerTypescriptProjectService } from '../typescript-project-service/register-typescript-project-service.js';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../typescript-project-service/typescript-project.service.token.js';
import type { CodeModelStore } from '../block-elements/code/code-model.store.js';
import { getCodeFieldText, isCodeFieldSkipped, type ICheckedField } from './checked-field.js';
import { describeCheckedFields } from './describe-checked-fields.js';
import { installFakeMonaco } from './fake-monaco.test-util.js';

const makeNode = (node: INode, parent: NodeStore | null = null): NodeStore => {
  const store = new NodeStore(node);
  store.parent = parent;
  store.children.replace((node.children ?? []).map((child) => makeNode(child, store)));
  return store;
};

const numberType = { type: 'number', numberType: { type: 'any' } } as const;
const stringType = { type: 'string' } as const;

/** function(a: number) → returns string; body: [create-var x, create-var list, target]. Returns the `target` node. */
const buildTarget = (target: Omit<INode, 'id'>): NodeStore => {
  const body: INode = {
    id: 'body',
    name: 'function-body',
    data: { name: 'fn', parameters: [{ name: 'a', type: numberType }], returnValue: stringType },
    children: [
      { id: 'v1', name: 'create-var', data: { name: 'x', variableType: numberType } },
      {
        id: 'v2',
        name: 'create-var',
        data: { name: 'list', variableType: { type: 'array', elementType: stringType, dimensions: 1 } },
      },
      { id: 'target', ...target },
    ],
  };
  const fn = makeNode({ id: 'fn', name: 'function', children: [body] });
  const found = fn.children[0].children.find((child) => child.id === 'target');
  if (!found) throw new Error('setup');
  return found;
};

const setup = () => {
  const container = rootContainer.createChildContainer();
  registerTypescriptProjectService(container);
  const projectService = resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, container);
  projectService.functionsRegistry.setFunction({
    schemeId: 'target-fn',
    name: 'add',
    parameters: [
      { name: 'p', type: numberType },
      { name: 'q', type: stringType },
    ],
    returnValue: numberType,
  });
  return { container, projectService };
};

const paramsFor = (node: NodeStore, container: any): IBlockEditorFactoryParams<any> => ({
  container,
  data: node.data,
  icon: { dataNode: node, id: node.id } as unknown as IconStore,
});

const codeFields = (fields: ICheckedField[]) =>
  Object.fromEntries(fields.filter((f) => f.kind === 'code').map((f) => [f.field, getCodeFieldText(f as any)]));

interface ICase {
  name: string;
  node: Omit<INode, 'id'>;
  /** Builds the editor store and returns `field → editor's full model text`. */
  editor: (params: IBlockEditorFactoryParams<any>) => { texts: Record<string, string>; dispose: () => void };
}

const full = (store: CodeModelStore) => store.fullValue;

const CASES: ICase[] = [
  {
    name: 'action',
    node: { name: 'action', data: 'x = 1' },
    editor: (p) => {
      const s = new ActionEditorStore(p);
      return { texts: { value: full(s.codeStore) }, dispose: () => s.dispose() };
    },
  },
  {
    name: 'while',
    node: { name: 'while', data: 'x &lt; 3' },
    editor: (p) => {
      const s = new ExpressionEditorStore(p);
      return { texts: { value: full(s.codeStore) }, dispose: () => s.dispose() };
    },
  },
  {
    name: 'if',
    node: { name: 'if', data: 'x > 1' },
    editor: (p) => {
      const s = new IfEditorStore(p);
      return { texts: { value: full(s.codeStore) }, dispose: () => s.dispose() };
    },
  },
  {
    name: 'return (value-returning function, blank data)',
    node: { name: 'return', data: '' },
    editor: (p) => {
      const s = new ReturnEditorStore(p);
      return { texts: { value: full(s.codeStore) }, dispose: () => s.dispose() };
    },
  },
  {
    name: 'log',
    node: { name: 'log', data: 'x is ${x}' },
    editor: (p) => {
      const s = new LogBlockEditorStore(p);
      return { texts: { value: full(s.message.codeStore) }, dispose: () => s.dispose() };
    },
  },
  {
    name: 'create-var',
    node: { name: 'create-var', data: { name: 'y', variableType: stringType, value: "'a'" } },
    editor: (p) => {
      const s = new CreateVarBlockEditorStore(p);
      return { texts: { value: full(s.valueCodeStore) }, dispose: () => s.dispose() };
    },
  },
  {
    name: 'arr-push',
    node: { name: 'arr-push', data: { arr: 'list', value: "'a'" } },
    editor: (p) => {
      const s = new ArrOpInputBlockEditorStore(p);
      return { texts: { arr: full(s.arrCodeStore), value: full(s.valueCodeStore) }, dispose: () => s.dispose() };
    },
  },
  {
    name: 'arr-pop',
    node: { name: 'arr-pop', data: { arr: 'list', variable: 'item' } },
    editor: (p) => {
      const s = new ArrOpReturningBlockEditorStore(p);
      return { texts: { arr: full(s.arrCodeStore) }, dispose: () => s.dispose() };
    },
  },
  {
    name: 'arr-insert',
    node: { name: 'arr-insert', data: { arr: 'list', start: '0', insertArr: "['a']" } },
    editor: (p) => {
      const s = new ArrInsertBlockEditorStore(p);
      return {
        texts: { arr: full(s.arrCodeStore), start: full(s.startCodeStore), insertArr: full(s.insertArrCodeStore) },
        dispose: () => s.dispose(),
      };
    },
  },
  {
    name: 'arr-slice',
    node: { name: 'arr-slice', data: { arr: 'list', variable: 'part', start: '0', end: '1' } },
    editor: (p) => {
      const s = new ArrSliceBlockEditorStore(p);
      return {
        texts: { arr: full(s.arrCodeStore), start: full(s.startCodeStore), end: full(s.endCodeStore) },
        dispose: () => s.dispose(),
      };
    },
  },
  {
    name: 'foreach',
    node: { name: 'foreach', data: { arr: 'list', item: 'it', index: 'i' } },
    editor: (p) => {
      const s = new ForeachHeaderBlockEditorStore(p);
      return { texts: { arr: full(s.arrCodeStore) }, dispose: () => s.dispose() };
    },
  },
  {
    name: 'from-to-cycle',
    node: { name: 'from-to-cycle', data: { from: '0', to: 'x', item: 'i' } },
    editor: (p) => {
      const s = new FromToCycleHeaderBlockEditorStore(p);
      return { texts: { from: full(s.fromCodeStore), to: full(s.toCodeStore) }, dispose: () => s.dispose() };
    },
  },
  {
    name: 'call-function',
    node: {
      name: 'call-function',
      data: { schemeId: 'target-fn', iconId: null, parameters: ['x', "'s'"], returnVariable: 'r' },
    },
    editor: (p) => {
      const s = new CallFunctionBlockEditorStore(p);
      return {
        texts: Object.fromEntries(s.parameters.fields.map((f) => [`parameters.${f.descriptor.key}`, full(f.store)])),
        dispose: () => s.dispose(),
      };
    },
  },
];

describe('describeCheckedFields — the editor and the background check build the same code', () => {
  beforeEach(() => installFakeMonaco());
  afterEach(() => undefined);

  for (const testCase of CASES) {
    it(`${testCase.name}: same full model text as the editor store`, () => {
      const { container, projectService } = setup();
      const node = buildTarget(testCase.node);
      const editor = testCase.editor(paramsFor(node, container));
      const described = codeFields(describeCheckedFields(node, { projectService }));
      expect(Object.keys(described).toSorted()).toEqual(Object.keys(editor.texts).toSorted());
      expect(described).toEqual(editor.texts);
      editor.dispose();
    });
  }

  it('call-api parameters are typed by the endpoint signature', () => {
    const { container, projectService } = setup();
    const node = buildTarget({
      name: 'call-api',
      data: { schemeId: 's', iconId: 'e1', parameters: ['1'], returnVariable: '' },
    });
    // no endpoint registered → no parameter fields, like the editor
    expect(describeCheckedFields(node, { projectService })).toEqual([]);
    const editor = new CallApiBlockEditorStore(paramsFor(node, container));
    expect(editor.parameters.fields).toHaveLength(0);
    editor.dispose();
  });

  it('describes the expected typing', () => {
    const { projectService } = setup();
    const ifNode = buildTarget({ name: 'if', data: 'x > 1' });
    const [field] = describeCheckedFields(ifNode, { projectService });
    expect(field.kind === 'code' && field.prefix).toContain('declare var x: number;');
    expect(field.kind === 'code' && field.prefix).toContain('_value = ');
    expect(getCodeFieldText(field as any).endsWith('\nexport {};')).toBe(true);

    const pop = buildTarget({ name: 'arr-pop', data: { arr: 'list', variable: 'list' } });
    const popFields = describeCheckedFields(pop, { projectService });
    expect(popFields.find((f) => f.field === 'variable')).toMatchObject({
      kind: 'identifier',
      value: 'list',
      scopeNames: expect.arrayContaining(['a', 'x', 'list']),
    });
  });

  it('create-var value is allowEmpty; switch default is skipped; unknown kinds have no fields', () => {
    const { projectService } = setup();
    const cv = buildTarget({ name: 'create-var', data: { name: 'y', variableType: numberType } });
    const [field] = describeCheckedFields(cv, { projectService });
    expect(field.kind === 'code' && isCodeFieldSkipped(field)).toBe(true);
    const opt = buildTarget({ name: 'switch-option', data: 'default' });
    const [optField] = describeCheckedFields(opt, { projectService });
    expect(optField.kind === 'code' && isCodeFieldSkipped(optField)).toBe(true);
    expect(describeCheckedFields(buildTarget({ name: 'pseudo-cycle' }), { projectService })).toEqual([]);
  });
});

describe('field describer registry', () => {
  it('lets other packages register describers by name or by resolver', async () => {
    const { registerFieldDescriber, registerFieldDescriberResolver, unregisterFieldDescriber } =
      await import('./field-describer-registry.js');
    const { projectService } = setup();
    registerFieldDescriber('vendor-thing', (node) => [
      { field: 'f', kind: 'code', prefix: '', value: String(node.data), suffix: '' },
    ]);
    const unregister = registerFieldDescriberResolver({
      resolve: (node) =>
        node.name.startsWith('dyn::')
          ? () => [{ field: 'd', kind: 'identifier', value: node.name, scopeNames: [] }]
          : undefined,
    });
    expect(describeCheckedFields(buildTarget({ name: 'vendor-thing', data: 'v' }), { projectService })).toHaveLength(1);
    expect(describeCheckedFields(buildTarget({ name: 'dyn::a' }), { projectService })[0].field).toBe('d');
    unregister();
    unregisterFieldDescriber('vendor-thing');
    expect(describeCheckedFields(buildTarget({ name: 'dyn::a' }), { projectService })).toEqual([]);
  });
});
