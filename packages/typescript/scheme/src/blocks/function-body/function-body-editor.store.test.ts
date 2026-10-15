import { container, type DependencyContainer } from '@falang/di';
import type { IBlockEditorFactoryParams, IconStore } from '@falang/scheme';
import { describe, expect, it } from 'vitest';
import type { TypescriptProjectService } from '../../typescript-project-service/typescript-project.service.js';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '../../typescript-project-service/typescript-project.service.token.js';
import { FunctionBodyBlockEditorStore, type IfunctionBody } from './function-body-editor.store.js';

const make = (data: Partial<IfunctionBody> = {}, c: DependencyContainer = container.createChildContainer()) => {
  const params: IBlockEditorFactoryParams<IfunctionBody> = {
    container: c,
    data: { parameters: [], ...data } as IfunctionBody,
    icon: { id: 'i' } as unknown as IconStore,
  };
  return new FunctionBodyBlockEditorStore(params);
};

const withParam = (type: unknown) => make({ parameters: [{ name: 'p', type }] } as unknown as Partial<IfunctionBody>);

describe('FunctionBodyBlockEditorStore', () => {
  it('has no project service unless one is registered, and resolves it when it is', () => {
    expect(make().projectService).toBeNull();
    const c = container.createChildContainer();
    const service = { typesRegistry: {} } as unknown as TypescriptProjectService;
    c.registerInstance(TOKEN_TYPESCRIPT_PROJECT_SERVICE, service);
    expect(make({}, c).projectService).toBe(service);
  });

  it('adds, renames and removes parameters', () => {
    const store = make();
    store.addParameter();
    store.addParameter();
    expect(store.getData().parameters).toEqual([
      { name: '', type: { type: 'string' } },
      { name: '', type: { type: 'string' } },
    ]);
    store.setParameterName(1, 'b');
    expect(store.getData().parameters.map((p) => p.name)).toEqual(['', 'b']);
    store.removeParameter(0);
    expect(store.getData().parameters.map((p) => p.name)).toEqual(['b']);
  });

  it.each([
    ['string', { type: 'string' }],
    ['boolean', { type: 'boolean' }],
    ['number', { type: 'number', numberType: { type: 'any' } }],
    ['array', { type: 'array', elementType: { type: 'string' }, dimensions: 1 }],
    ['struct', { type: 'struct', id: '' }],
    ['enum', { type: 'enum', schemeId: '', iconId: '' }],
    ['void', { type: 'void' }],
    ['any', { type: 'any' }],
    ['never', { type: 'never' }],
    ['union', { type: 'union', unionTypes: [] }],
    ['unknown-kind', { type: 'string' }],
  ])('setParameterType(%s) installs the default for that type', (kind, expected) => {
    const store = make({ parameters: [{ name: 'a', type: { type: 'any' } }] } as unknown as Partial<IfunctionBody>);
    store.setParameterType(0, kind as never);
    expect(store.getData().parameters[0].type).toEqual(expected);
  });

  it('edits array parameters (element type, dimensions, struct element) and ignores non-arrays', () => {
    const store = withParam({ type: 'array', elementType: { type: 'string' }, dimensions: 1 });
    store.setParameterArrayElementType(0, 'number');
    expect(store.getData().parameters[0].type).toMatchObject({ elementType: { type: 'number' }, dimensions: 1 });
    store.setParameterArrayDimensions(0, 3);
    expect(store.getData().parameters[0].type).toMatchObject({ dimensions: 3 });
    store.setParameterArrayElementStructId(0, 'nope');
    expect(store.getData().parameters[0].type).toMatchObject({ elementType: { type: 'number' } });
    store.setParameterArrayElementType(0, 'struct');
    store.setParameterArrayElementStructId(0, 's1');
    expect(store.getData().parameters[0].type).toMatchObject({ elementType: { type: 'struct', id: 's1' } });

    const scalar = withParam({ type: 'string' });
    scalar.setParameterArrayElementType(0, 'number');
    scalar.setParameterArrayDimensions(0, 2);
    scalar.setParameterArrayElementStructId(0, 'x');
    expect(scalar.getData().parameters[0].type).toEqual({ type: 'string' });
    scalar.setParameterArrayElementType(5, 'number');
    expect(scalar.getData().parameters).toHaveLength(1);
  });

  it('sets a struct id only on a struct parameter', () => {
    const struct = withParam({ type: 'struct', id: '' });
    struct.setParameterStructId(0, 's2');
    expect(struct.getData().parameters[0].type).toEqual({ type: 'struct', id: 's2' });
    const other = withParam({ type: 'boolean' });
    other.setParameterStructId(0, 's2');
    expect(other.getData().parameters[0].type).toEqual({ type: 'boolean' });
  });

  it('void return type means no returnValue at all', () => {
    const store = make({ returnValue: { type: 'string' } } as unknown as Partial<IfunctionBody>);
    store.setReturnValueType('number');
    expect(store.getData().returnValue).toEqual({ type: 'number', numberType: { type: 'any' } });
    store.setReturnValueType('void');
    expect(store.getData().returnValue).toBeUndefined();
  });

  it('edits array/struct return values and ignores them for other types', () => {
    const store = make({ returnValue: { type: 'array', elementType: { type: 'string' }, dimensions: 1 } } as never);
    store.setReturnValueArrayElementType('boolean');
    store.setReturnValueArrayDimensions(2);
    expect(store.getData().returnValue).toEqual({ type: 'array', elementType: { type: 'boolean' }, dimensions: 2 });
    store.setReturnValueArrayElementStructId('x');
    expect(store.getData().returnValue).toMatchObject({ elementType: { type: 'boolean' } });
    store.setReturnValueArrayElementType('struct');
    store.setReturnValueArrayElementStructId('s3');
    expect(store.getData().returnValue).toMatchObject({ elementType: { type: 'struct', id: 's3' } });
    store.setReturnValueStructId('ignored');
    expect(store.getData().returnValue).toMatchObject({ type: 'array' });

    const struct = make({ returnValue: { type: 'struct', id: '' } } as never);
    struct.setReturnValueStructId('s4');
    expect(struct.getData().returnValue).toEqual({ type: 'struct', id: 's4' });
    struct.setReturnValueArrayDimensions(3);
    struct.setReturnValueArrayElementType('string');
    expect(struct.getData().returnValue).toEqual({ type: 'struct', id: 's4' });

    const none = make();
    none.setReturnValueArrayDimensions(2);
    none.setReturnValueArrayElementStructId('q');
    expect(none.getData().returnValue).toBeUndefined();
  });
});
