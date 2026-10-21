// oxlint-disable no-explicit-any
import { container as rootContainer } from '@falang/di';
import { NodeStore, type IBlockEditorFactoryParams, type IconStore } from '@falang/scheme';
import { beforeEach, describe, expect, it } from 'vitest';
import { installFakeMonaco } from '../../field-check/fake-monaco.test-util.js';
import { registerTypescriptProjectService } from '../../typescript-project-service/register-typescript-project-service.js';
import { CreateVarBlockEditorStore, type ICreateVar } from './create-var-editor.store.js';

const numberType = { type: 'number', numberType: { type: 'any' } } as const;
const stringType = { type: 'string' } as const;

const build = (data: ICreateVar): CreateVarBlockEditorStore => {
  const container = rootContainer.createChildContainer();
  registerTypescriptProjectService(container);
  const node = new NodeStore({ id: 'v', name: 'create-var', data });
  const params: IBlockEditorFactoryParams<ICreateVar> = {
    container: container as any,
    data,
    icon: { dataNode: node, id: node.id } as unknown as IconStore,
  };
  return new CreateVarBlockEditorStore(params);
};

describe('CreateVarBlockEditorStore — string values edited as text', () => {
  beforeEach(() => installFakeMonaco());

  it('edits a string variable as text and stores a string literal', () => {
    const store = build({ name: 's', variableType: stringType, value: "'hello'" });
    expect(store.valueTextStore?.value).toBe('hello');
    store.valueTextStore?.codeStore.setValue("it's ${n}");
    expect(store.getData().value).toBe("`it's ${n}`");
    store.valueTextStore?.codeStore.setValue('plain');
    expect(store.getData().value).toBe("'plain'");
    store.dispose();
  });

  it('an empty text means no initial value', () => {
    const store = build({ name: 's', variableType: stringType });
    expect(store.valueTextStore?.value).toBe('');
    expect(store.getData().value).toBeUndefined();
    store.dispose();
  });

  it('a non-literal string expression becomes one interpolation', () => {
    const store = build({ name: 's', variableType: stringType, value: 'name + "!"' });
    expect(store.valueTextStore?.value).toBe('${name + "!"}');
    expect(store.getData().value).toBe('`${name + "!"}`');
    store.dispose();
  });

  it('other types keep the expression field', () => {
    const store = build({ name: 'n', variableType: numberType, value: '1 + 2' });
    expect(store.valueTextStore).toBeNull();
    expect(store.getData().value).toBe('1 + 2');
    store.dispose();
  });

  it('converts the value when the type changes', () => {
    const store = build({ name: 'v', variableType: numberType, value: '' });
    store.setVariableType(stringType);
    store.valueTextStore?.codeStore.setValue('abc');
    expect(store.getData().value).toBe("'abc'");
    store.setVariableType(numberType);
    expect(store.valueTextStore).toBeNull();
    expect(store.valueCodeStore.value).toBe("'abc'");
    store.setVariableType(stringType);
    expect(store.valueTextStore?.value).toBe('abc');
    store.dispose();
  });
});
