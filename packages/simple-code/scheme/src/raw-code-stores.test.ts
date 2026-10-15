import type { DependencyContainer } from '@falang/di';
import type { IBlockEditorFactoryParams, IconStore } from '@falang/scheme';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installCodeLanguageTokenizers,
  monacoLanguageId,
  registerCodeLanguages,
} from './block-elements/raw-code/monaco-languages.js';
import { RawCodeModelStore } from './block-elements/raw-code/raw-code-model.store.js';
import { RawCodeBlockEditorStore } from './blocks/raw-code/raw-code-block-editor.store.js';

const created: { uri: string; language: string; value: string; disposed: boolean }[] = [];

const fakeModel = (value: string, language: string, uri: string) => {
  const record = { uri, language, value, disposed: false };
  created.push(record);
  const model = {
    value,
    getValue: () => model.value,
    setValue: (next: string) => {
      model.value = next;
    },
    dispose: () => {
      record.disposed = true;
    },
  };
  return model;
};

const languagesApi = {
  register: vi.fn(),
  setLanguageConfiguration: vi.fn(),
  setMonarchTokensProvider: vi.fn(),
};

const fakeMonaco = {
  editor: { createModel: (value: string, language: string, uri: string) => fakeModel(value, language, uri) },
  Uri: { parse: (s: string) => s },
  languages: languagesApi,
};

vi.mock('@falang/typescript-scheme', () => ({ getMonaco: () => fakeMonaco }));

beforeEach(() => {
  created.length = 0;
});

const bundle = () => ({ conf: {}, language: { tokenizer: {} } }) as never;

describe('monaco-languages', () => {
  it('maps real ids for cpp/php/rust and private aliases for ts/js', () => {
    expect(monacoLanguageId('cpp')).toBe('cpp');
    expect(monacoLanguageId('php')).toBe('php');
    expect(monacoLanguageId('rust')).toBe('rust');
    expect(monacoLanguageId('ts')).not.toBe('typescript');
    expect(monacoLanguageId('js')).not.toBe('javascript');
    expect(monacoLanguageId('ts')).not.toBe(monacoLanguageId('js'));
  });

  it('refuses to register the aliases until a host installs the tokenizers, then registers them once', () => {
    expect(() => registerCodeLanguages(fakeMonaco as never)).toThrow(/tokenizers are not installed/);
    expect(languagesApi.register).not.toHaveBeenCalled();

    installCodeLanguageTokenizers({ typescript: bundle(), javascript: bundle() });
    registerCodeLanguages(fakeMonaco as never);
    expect(languagesApi.register.mock.calls.map((c) => c[0].id)).toEqual([
      monacoLanguageId('ts'),
      monacoLanguageId('js'),
    ]);
    expect(languagesApi.setMonarchTokensProvider).toHaveBeenCalledTimes(2);

    registerCodeLanguages(fakeMonaco as never);
    expect(languagesApi.register).toHaveBeenCalledTimes(2);
  });
});

describe('RawCodeModelStore', () => {
  it('creates a model under a per-language file name and language id', () => {
    const store = new RawCodeModelStore({ id: 'n1', language: 'rust', value: 'fn x() {}', name: 'body' });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ uri: 'file:///n1-body.rs', language: 'rust', value: 'fn x() {}' });
    expect(store.value).toBe('fn x() {}');
  });

  it('defaults to an empty value and no name suffix', () => {
    const store = new RawCodeModelStore({ id: 'n2', language: 'ts' });
    expect(store.value).toBe('');
    expect(created[0]).toMatchObject({ uri: 'file:///n2.ts', value: '', language: monacoLanguageId('ts') });
  });

  it('setValue writes through to the model, updateValue pulls the live content back', () => {
    const store = new RawCodeModelStore({ id: 'n3', language: 'cpp', value: 'a' });
    store.setValue('b');
    expect(store.value).toBe('b');
    expect(store.model.getValue()).toBe('b');
    store.model.setValue('typed');
    expect(store.value).toBe('b');
    store.updateValue();
    expect(store.value).toBe('typed');
  });

  it('tracks the editor instance and disposes the model', () => {
    const store = new RawCodeModelStore({ id: 'n4', language: 'php' });
    const editor = {} as never;
    store.setEditor(editor);
    expect(store.editor).toBe(editor);
    store.setEditor(null);
    expect(store.editor).toBeNull();
    store.dispose();
    expect(created[0].disposed).toBe(true);
  });
});

describe('RawCodeBlockEditorStore', () => {
  const params = (data: string): IBlockEditorFactoryParams<string> => ({
    container: {} as DependencyContainer,
    data,
    icon: { id: 'icon-9' } as unknown as IconStore,
  });

  it('wraps a model seeded from the block data', () => {
    const store = new RawCodeBlockEditorStore(params('let x = 1'), 'js');
    expect(created[0]).toMatchObject({ uri: 'file:///icon-9.js', value: 'let x = 1' });
    expect(store.getData()).toBe('let x = 1');
  });

  it('setValue updates getData and dispose releases the model', () => {
    const store = new RawCodeBlockEditorStore(params(''), 'cpp');
    store.setValue('int main(){}');
    expect(store.getData()).toBe('int main(){}');
    store.dispose();
    expect(created[0].disposed).toBe(true);
  });
});
