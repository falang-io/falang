// oxlint-disable max-lines, no-promise-executor-return, no-explicit-any, no-void, no-undefined, no-useless-undefined, no-inline-comments
import { container as rootContainer, resolveService } from '@falang/di';
import type { INode } from '@falang/dto';
import {
  CMD_INSERT_NODE,
  CMD_SET_DATA,
  registerGlobalTokens,
  TOKEN_VALIDATION_STORE,
  ValidationModule,
  ValidationQueue,
  type IBlockEditorFactoryParams,
  type IconStore,
  type Scheme,
} from '@falang/scheme';
import {
  describeCheckedFields,
  getCodeFieldText,
  isCodeFieldSkipped,
  registerTypescriptProjectService,
  createTypescriptFieldsValidator,
  type CodeModelStore,
  type ICheckedField,
  type MonacoCheckPool,
} from '@falang/typescript-scheme';
import { createTriggerFunctionNode } from '@falang/workflow-dto';
import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActivepiecesActionEditorStore } from '../blocks/activepieces-action/activepieces-action-editor.store.js';
import { ChoiceEditorStore } from '../blocks/integration-choice/choice-editor.store.js';
import { IntegrationActionEditorStore } from '../blocks/integration-action/integration-action-editor.store.js';
import { QuestionEditorStore } from '../blocks/integration-question/question-editor.store.js';
import { installFakeMonaco } from '../test-utils/fake-monaco.js';
import { workflowFunctionalSchemeFactory } from '../workflow-functional-scheme-factory.js';

const numberType = { type: 'number', numberType: { type: 'any' } } as const;
const noop = { emit: () => '', activityCode: '', activitySignature: '' };

const acme: IWorkflowIntegration = {
  vendor: 'acme',
  label: 'Acme',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [
    {
      name: 'acme-call',
      label: 'Call',
      ...noop,
      fields: [
        { name: 'credential', label: 'Credential', kind: 'credential-ref', vendor: 'acme' },
        {
          name: 'method',
          label: 'Method',
          kind: 'select',
          options: [
            { value: 'get', label: 'get' },
            { value: 'post', label: 'post' },
          ],
        },
        {
          name: 'payload',
          label: 'Payload',
          kind: 'expression',
          expectedType: (fields) => (fields['method'] === 'post' ? numberType : undefined),
        },
        { name: 'chatId', label: 'Chat', kind: 'expression', expectedType: numberType },
        { name: 'text', label: 'Text', kind: 'template-string' },
        { name: 'optional', label: 'Optional', kind: 'expression', defaultValue: '' },
        { name: 'result', label: 'Result', kind: 'new-variable', defaultValue: '' },
      ],
    },
  ],
  questions: [
    {
      name: 'acme-ask',
      label: 'Ask',
      contextFields: [{ name: 'chatId', label: 'Chat', kind: 'expression', expectedType: numberType }],
      questionFields: [{ name: 'text', label: 'Text', kind: 'template-string' }],
      answerSignalName: 'a',
      askActivitySignature: '',
      askActivityCode: '',
      resolveActivitySignature: '',
      resolveActivityCode: '',
    },
  ],
  choices: [
    {
      name: 'acme-pick',
      label: 'Pick',
      contextFields: [{ name: 'chatId', label: 'Chat', kind: 'expression', expectedType: numberType }],
      promptFields: [{ name: 'prompt', label: 'Prompt', kind: 'template-string' }],
      activitySignature: '',
      activityCode: '',
    } as any,
  ],
};

interface IHarness {
  scheme: Scheme;
  add: (id: string, name: string, data: unknown) => NodeStoreLike;
}
type NodeStoreLike = ReturnType<Scheme['nodes']['getNode']>;

const stringDoc = (type: 'function' | 'trigger-function'): any => {
  const triggerRoot =
    type === 'trigger-function'
      ? createTriggerFunctionNode({
          vendor: 'acme',
          triggerName: 't',
          credentialId: 'c1',
          scopeVariableName: 'message',
          scopeType: { type: 'string' },
        })
      : undefined;
  const root: INode = triggerRoot ?? {
    id: 'root',
    name: 'function',
    children: [
      { id: 'h', name: 'function-header', data: '' },
      {
        id: 'b',
        name: 'function-body',
        data: { name: 'fn', parameters: [{ name: 'a', type: numberType }] },
        children: [],
      },
      { id: 'f', name: 'function-footer', data: '' },
    ],
  };
  return { id: 'd', type, name: 'doc', root };
};

const instances = [{ id: 'c1', vendor: 'acme', name: 'Acme 1', fields: {} }] as any;

const build = (type: 'function' | 'trigger-function' = 'function', extra: Record<string, unknown> = {}): IHarness => {
  registerGlobalTokens();
  const container = rootContainer.createChildContainer();
  registerTypescriptProjectService(container);
  const scheme: Scheme = workflowFunctionalSchemeFactory({
    parentContainer: container,
    integrations: [acme],
    getCredentialInstances: () => instances,
    document: stringDoc(type),
    ...extra,
  });
  const body = scheme.rootNode?.children[1];
  if (!body) throw new Error('no body');
  const add = (id: string, name: string, data: unknown) => {
    const node = scheme.infra.structure.factory(name);
    Object.assign(node, { id, data });
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: body.children.length, parentId: body.id, node });
    return scheme.nodes.getNode(id);
  };
  return { scheme, add };
};

const paramsFor = (node: NodeStoreLike, scheme: Scheme): IBlockEditorFactoryParams<any> => ({
  container: scheme.container,
  data: node.data,
  icon: { dataNode: node, id: node.id, name: node.name } as unknown as IconStore,
});

const codeTexts = (fields: ICheckedField[]) =>
  Object.fromEntries(fields.filter((f) => f.kind === 'code').map((f) => [f.field, getCodeFieldText(f as any)]));
const full = (store: CodeModelStore) => store.fullValue;

const resolveCtx = async (h: IHarness) => {
  const { TOKEN_TYPESCRIPT_PROJECT_SERVICE } = await import('@falang/typescript-scheme');
  return {
    projectService: resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, h.scheme.container),
    container: h.scheme.container,
  };
};

const ACTION_DATA = {
  credential: 'c1',
  method: 'post',
  payload: 'a + 1',
  chatId: 'a',
  text: 'hi ${a}',
  optional: '',
  result: 'res',
};

describe('workflow field describers — the editor and the background check build the same code', () => {
  let scheme: Scheme | null = null;
  beforeEach(() => installFakeMonaco());
  afterEach(() => scheme?.dispose());

  it('integration-action: expression (static and function expectedType), template-string, new-variable', async () => {
    const h = build();
    scheme = h.scheme;
    const node = h.add('n', 'acme-call', ACTION_DATA);
    const ctx = await resolveCtx(h);
    const fields = describeCheckedFields(node, ctx);
    const editor = new IntegrationActionEditorStore(paramsFor(node, h.scheme));
    const editorTexts = {
      ...Object.fromEntries([...editor.codeStores].map(([name, store]) => [name, full(store)])),
      ...Object.fromEntries([...editor.templateStringStores].map(([name, store]) => [name, full(store.codeStore)])),
    };
    expect(codeTexts(fields)).toEqual(editorTexts);
    expect(Object.keys(editorTexts).toSorted()).toEqual(['chatId', 'optional', 'payload', 'text']);
    // function-valued expectedType: `method: 'post'` forces a number, 'get' leaves the bare scope
    expect(codeTexts(fields)['payload']).toContain('_value = ');
    const identifier = fields.find((f) => f.kind === 'identifier');
    expect(identifier).toMatchObject({ field: 'result', value: 'res', scopeNames: expect.arrayContaining(['a']) });
    editor.dispose();

    const get = h.add('n2', 'acme-call', { ...ACTION_DATA, method: 'get' });
    const getFields = describeCheckedFields(get, ctx);
    const getEditor = new IntegrationActionEditorStore(paramsFor(get, h.scheme));
    expect(codeTexts(getFields)['payload']).toBe(full(getEditor.codeStores.get('payload') as CodeModelStore));
    expect(codeTexts(getFields)['payload']).not.toContain('_value = ');
    getEditor.dispose();
  });

  it('a missing stored value takes the field default; an optional empty field is not checked', async () => {
    const h = build();
    scheme = h.scheme;
    const node = h.add('n', 'acme-call', { credential: 'c1', method: 'get', chatId: 'a', text: '' });
    const ctx = await resolveCtx(h);
    const fields = describeCheckedFields(node, ctx);
    const optional = fields.find((f) => f.field === 'optional') as any;
    expect(optional.allowEmpty).toBe(true);
    expect(isCodeFieldSkipped(optional)).toBe(true);
    // the empty optional new-variable produces no identifier field at all
    expect(fields.some((f) => f.kind === 'identifier')).toBe(false);
    // a required field is checked as it stands, even when empty
    const chat = describeCheckedFields(h.add('n3', 'acme-call', { ...ACTION_DATA, chatId: '' }), ctx).find(
      (f) => f.field === 'chatId',
    ) as any;
    expect(isCodeFieldSkipped(chat)).toBe(false);
  });

  it('question header: contextFields and questionFields', async () => {
    const h = build();
    scheme = h.scheme;
    const node = h.add('q', 'acme-ask', { chatId: 'a', text: 'Hello ${a}', options: ['Yes', 'No'] });
    const ctx = await resolveCtx(h);
    const editor = new QuestionEditorStore(paramsFor(node, h.scheme));
    const editorTexts = {
      ...Object.fromEntries([...editor.codeStores].map(([name, store]) => [name, full(store)])),
      ...Object.fromEntries([...editor.templateStringStores].map(([name, store]) => [name, full(store.codeStore)])),
    };
    expect(codeTexts(describeCheckedFields(node, ctx))).toEqual(editorTexts);
    expect(Object.keys(editorTexts).toSorted()).toEqual(['chatId', 'text']);
    editor.dispose();
  });

  it('choice header: code fields plus the node-wide variable identifier', async () => {
    const h = build();
    scheme = h.scheme;
    const node = h.add('c', 'acme-pick', {
      chatId: 'a',
      prompt: 'Pick for ${a}',
      options: [{ alias: 'x', dataType: { type: 'string' }, variable: 'picked' }],
    });
    const ctx = await resolveCtx(h);
    const editor = new ChoiceEditorStore(paramsFor(node, h.scheme));
    const editorTexts = {
      ...Object.fromEntries([...editor.codeStores].map(([name, store]) => [name, full(store)])),
      ...Object.fromEntries([...editor.templateStringStores].map(([name, store]) => [name, full(store.codeStore)])),
    };
    const fields = describeCheckedFields(node, ctx);
    expect(codeTexts(fields)).toEqual(editorTexts);
    expect(fields.find((f) => f.kind === 'identifier')).toMatchObject({ field: 'variable', value: 'picked' });
    expect(editor.variableStore.value).toBe('picked');
    editor.dispose();
  });

  it('activepieces-action: every stored prop is a bare-scope field, like the editor', async () => {
    const piece = {
      pieceName: 'p',
      displayName: 'P',
      actions: [
        {
          name: 'act',
          displayName: 'Act',
          props: [
            { name: 'one', type: 'SHORT_TEXT' },
            { name: 'two', type: 'SHORT_TEXT' },
          ],
        },
      ],
    };
    const h = build('function', {
      getActivepiecesCatalogProvider: () => ({ getPieces: () => Promise.resolve([piece]) }),
    });
    scheme = h.scheme;
    const node = h.add('ap', 'activepieces-action', {
      pieceName: 'p',
      actionName: 'act',
      credentialId: '',
      propsValue: { one: 'a + 1', two: '' },
    });
    const ctx = await resolveCtx(h);
    const editor = new ActivepiecesActionEditorStore(paramsFor(node, h.scheme));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const editorTexts = Object.fromEntries([...editor.codeStores].map(([name, store]) => [name, full(store)]));
    expect(Object.keys(editorTexts).toSorted()).toEqual(['one', 'two']);
    expect(codeTexts(describeCheckedFields(node, ctx))).toEqual(editorTexts);
    editor.dispose();
    // the picker state (no piece chosen) has nothing to check
    h.scheme.commands.dispatchCommand(CMD_SET_DATA, {
      id: 'ap',
      data: { pieceName: '', actionName: '', credentialId: '', propsValue: {} },
    });
    expect(describeCheckedFields(node, ctx)).toEqual([]);
  });

  it('unknown vendors / no registry describe nothing', async () => {
    const h = build();
    scheme = h.scheme;
    const node = h.add('x', 'action', 'a = 1');
    expect(describeCheckedFields(node, { projectService: null, container: null }).length).toBe(1); // builtin action
    const ctx = await resolveCtx(h);
    expect(describeCheckedFields(h.scheme.nodes.getNode('b'), ctx)).toEqual([]);
  });

  it('trigger-function: the bound payload is in scope, and the descriptor still equals the editor', async () => {
    const h = build('trigger-function');
    scheme = h.scheme;
    const node = h.add('n', 'acme-call', { ...ACTION_DATA, text: 'got ${message}' });
    const ctx = await resolveCtx(h);
    const fields = describeCheckedFields(node, ctx);
    const text = codeTexts(fields)['text'];
    expect(text).toContain('declare const message: string;');
    expect(text).toContain('got ${message}');
    const editor = new IntegrationActionEditorStore(paramsFor(node, h.scheme));
    expect(text).toBe(full((editor.templateStringStores.get('text') as any).codeStore));
    editor.dispose();
  });
});

describe('ValidationModule + TypeScript validator on integration fields', () => {
  let scheme: Scheme | null = null;
  afterEach(() => scheme?.dispose());

  it('an unknown identifier in an integration action field is reported with the field name', async () => {
    const pool = {
      isAvailable: () => true,
      check: (text: string, regions?: { prefixLength: number; valueLength: number }) => {
        const offset = text.indexOf('undeclared');
        if (offset === -1) return Promise.resolve([]);
        return Promise.resolve([
          {
            message: 'Cannot find name',
            offset,
            line: 1,
            column: 1,
            region: regions && offset >= regions.prefixLength ? 'value' : 'prefix',
          },
        ]);
      },
    } as unknown as MonacoCheckPool;
    const queue = new ValidationQueue({ schedule: (fn) => void Promise.resolve().then(fn) });
    const h = build('function', {
      extraModules: [new ValidationModule({ validators: [createTypescriptFieldsValidator({ pool }) as any], queue })],
    });
    scheme = h.scheme;
    h.add('n', 'acme-call', { ...ACTION_DATA, chatId: 'undeclared' });
    await queue.idle();
    const store = resolveService(TOKEN_VALIDATION_STORE, h.scheme.container);
    expect(store.issuesFor('n')).toMatchObject([{ field: 'chatId', severity: 'error', source: 'typescript' }]);

    h.scheme.commands.dispatchCommand(CMD_SET_DATA, { id: 'n', data: { ...ACTION_DATA, chatId: 'a' } });
    await queue.idle();
    expect(store.issuesFor('n')).toEqual([]);
  });
});
