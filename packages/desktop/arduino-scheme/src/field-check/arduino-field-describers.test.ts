// oxlint-disable no-explicit-any
import { container as rootContainer, resolveService } from '@falang/di';
import {
  CMD_INSERT_NODE,
  createNodeStoreFromNode,
  registerGlobalTokens,
  setRootNodeForScheme,
  type IBlockEditorFactoryParams,
  type IconStore,
  type Scheme,
} from '@falang/scheme';
import {
  collectNodeScope,
  describeCheckedFields,
  getCodeFieldText,
  registerTypescriptProjectService,
  TOKEN_TYPESCRIPT_PROJECT_SERVICE,
  type ICheckedField,
} from '@falang/typescript-scheme';
import { parseDriverConfig } from '@falang/desktop-arduino-dto/src/driver-config.js';
import { buildDriverActionNodeName } from '@falang/desktop-arduino-dto/src/driver-node-name.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { arduinoSchemeFactory } from '../arduino-scheme-factory.js';
import { initializeDriverRegistry } from '../driver-nodes/driver-registry-cache.js';
import { createZeroArgReadBlockConfig } from '../arduino-functions/zero-arg-read.block.js';
import { driverActionBlockConfig } from '../driver-nodes/driver-action-block.config.js';
import { pinReadBlockConfig } from '../pin-nodes/pin-read.block.js';
import { installFakeMonaco } from '../test-utils/fake-monaco.js';

const driver = parseDriverConfig({
  id: 'disp',
  label: 'Display',
  includes: ['d.h'],
  sourceFiles: ['d.h', 'd.cpp'],
  declarations: ['declare function disp_print(a: string): void;', 'declare function disp_read(): number;'],
  actions: [
    {
      id: 'print',
      label: 'Print',
      fields: [{ name: 'text', label: 'Text', kind: 'string', default: 'hi' }],
      codeTemplate: 'disp_print(`${text}`)',
    },
    {
      id: 'read',
      label: 'Read',
      fields: [
        { name: 'pin', label: 'Pin', kind: 'pin', default: '2' },
        { name: 'result', label: 'Result', kind: 'new-variable' },
      ],
      codeTemplate: 'const ${result} = disp_read()',
      resultType: 'float',
    },
  ],
});

const PRINT = buildDriverActionNodeName('disp', 'print');
const READ = buildDriverActionNodeName('disp', 'read');

const build = () => {
  registerGlobalTokens();
  const container = rootContainer.createChildContainer();
  registerTypescriptProjectService(container);
  const scheme: Scheme = arduinoSchemeFactory({ id: 'd', name: 'doc', parentContainer: container });
  setRootNodeForScheme(scheme, createNodeStoreFromNode(scheme.infra.structure.factory('function'), scheme));
  const body = scheme.rootNode?.children[1];
  if (!body) throw new Error('no body');
  const add = (id: string, name: string, data: unknown) => {
    const node = scheme.infra.structure.factory(name);
    Object.assign(node, { id, data });
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: body.children.length, parentId: body.id, node });
    return scheme.nodes.getNode(id);
  };
  const ctx = {
    projectService: resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, scheme.container),
    container: scheme.container,
  };
  return { scheme, add, ctx };
};

const paramsFor = (node: any, scheme: Scheme): IBlockEditorFactoryParams<any> => ({
  container: scheme.container,
  data: node.data,
  icon: { dataNode: node, id: node.id, name: node.name } as unknown as IconStore,
});

const codeTexts = (fields: ICheckedField[]) =>
  Object.fromEntries(fields.filter((f) => f.kind === 'code').map((f) => [f.field, getCodeFieldText(f as any)]));

describe('arduino field describers', () => {
  let scheme: Scheme | null = null;
  beforeEach(() => {
    installFakeMonaco();
    initializeDriverRegistry([driver]);
  });
  afterEach(() => {
    scheme?.dispose();
    initializeDriverRegistry([]);
  });

  it('a driver action: the template field equals the editor model, the new-variable field uses the editor scope', () => {
    const h = build();
    scheme = h.scheme;
    h.add('v', 'create-var', {
      name: 'taken',
      variableType: { type: 'number', numberType: { type: 'any' } },
      value: '',
    });
    const print = h.add('p', PRINT, { text: 'x ${undeclared}' });
    const read = h.add('r', READ, { pin: '3', result: 'res' });
    const makeDriverEditor = (p: any) => (driverActionBlockConfig.editor as any).editorFactory(p);

    const printFields = describeCheckedFields(print, h.ctx);
    const printEditor = makeDriverEditor(paramsFor(print, h.scheme));
    expect(codeTexts(printFields)).toEqual({ text: printEditor.templateStores.get('text').codeStore.fullValue });
    expect(codeTexts(printFields)['text']).toContain('${undeclared}');
    printEditor.dispose();

    const readFields = describeCheckedFields(read, h.ctx);
    expect(readFields).toHaveLength(1);
    const identifier = readFields[0] as any;
    expect(identifier).toMatchObject({ kind: 'identifier', field: 'result', value: 'res' });
    const readEditor = makeDriverEditor(paramsFor(read, h.scheme));
    expect(identifier.scopeNames).toEqual(collectNodeScope(read, h.ctx.projectService).map((v) => v.name));
    expect(identifier.scopeNames).toContain('taken');
    expect(readEditor.variableStore.value).toBe('res');
    readEditor.dispose();
  });

  it('a missing stored value takes the field default', () => {
    const h = build();
    scheme = h.scheme;
    const print = h.add('p', PRINT, {});
    expect(codeTexts(describeCheckedFields(print, h.ctx))['text']).toContain('hi');
  });

  it('pin-read / millis / random: the identifier uses the same scope as the editor store', () => {
    const h = build();
    scheme = h.scheme;
    h.add('v', 'create-var', {
      name: 'taken',
      variableType: { type: 'number', numberType: { type: 'any' } },
      value: '',
    });
    for (const [name, data, makeEditor] of [
      ['pin-read-digital', { pin: 2, variable: 'a' }, (p: any) => (pinReadBlockConfig.editor as any).editorFactory(p)],
      [
        'millis',
        { variable: 'm' },
        (p: any) => (createZeroArgReadBlockConfig('millis').editor as any).editorFactory(p),
      ],
    ] as const) {
      const node = h.add(`n-${name}`, name, data);
      const fields = describeCheckedFields(node, h.ctx);
      expect(fields).toEqual([
        {
          kind: 'identifier',
          field: 'variable',
          value: (data as any).variable,
          scopeNames: collectNodeScope(node, h.ctx.projectService).map((v) => v.name),
        },
      ]);
      const editor = makeEditor(paramsFor(node, h.scheme));
      expect(editor.variableStore.value).toBe((data as any).variable);
      // the editor reports a clash exactly where the descriptor's scope has the name
      expect((fields[0] as any).scopeNames).toContain('taken');
      editor.dispose?.();
    }
    const random = h.add('rnd', 'random', { max: 5, variable: 'r' });
    expect(describeCheckedFields(random, h.ctx).map((f) => f.field)).toEqual(['variable']);
  });

  it('unchecked and unknown nodes describe nothing', () => {
    const h = build();
    scheme = h.scheme;
    for (const [name, data] of [
      ['pin-write-digital', { pin: 1, value: true }],
      ['pin-write-analog', { pin: 1, value: 5 }],
      ['delay', { value: 10 }],
      ['serial-print', { value: 1 }],
    ] as const) {
      expect(describeCheckedFields(h.add(`n-${name}`, name, data), h.ctx)).toEqual([]);
    }
    expect(
      describeCheckedFields(h.scheme.rootNode?.children[1] as never, { projectService: null, container: null }),
    ).toEqual([]);
    expect(describeCheckedFields(h.scheme.rootNode?.children[1] as never, h.ctx)).toEqual([]);
  });
});
