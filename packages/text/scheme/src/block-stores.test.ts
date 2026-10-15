import { container, type DependencyContainer } from '@falang/di';
import type { IProjectTreeDocument } from '@falang/dto';
import { TOKEN_SCHEME, type IBlockEditorFactoryParams, type IconStore, type Scheme } from '@falang/scheme';
import { describe, expect, it } from 'vitest';
import { ContourFunctionFooterBlockEditorStore } from './blocks/contour-function-footer/contour-function-footer.block.editor.store.js';
import { stripTags } from './blocks/contour-function-footer/strip-tags.js';
import { HtmlBlockEditorStore } from './blocks/html/html-block-editor.store.js';
import { LinkBlockEditorStore, type ILinkData } from './blocks/link/link-block-editor.store.js';
import { ProjectDocumentsRegistryStore } from './project-documents-registry/project-documents-registry.store.js';
import { TOKEN_PROJECT_DOCUMENTS_REGISTRY } from './project-documents-registry/project-documents-registry.token.js';

const params = <T>(data: T, c: DependencyContainer): IBlockEditorFactoryParams<T> => ({
  container: c,
  data,
  icon: { id: 'icon-1' } as unknown as IconStore,
});

describe('LinkBlockEditorStore', () => {
  it('falls back to null registry and document id when nothing is registered', () => {
    const store = new LinkBlockEditorStore(params<ILinkData>({ documentId: 'a' }, container.createChildContainer()));
    expect(store.registry).toBeNull();
    expect(store.currentDocumentId).toBeNull();
    expect(store.getData()).toEqual({ documentId: 'a' });
  });

  it('resolves the registry and the current scheme id from the container', () => {
    const c = container.createChildContainer();
    const registry = new ProjectDocumentsRegistryStore();
    c.registerInstance(TOKEN_PROJECT_DOCUMENTS_REGISTRY, registry);
    c.registerInstance(TOKEN_SCHEME, { id: 'scheme-7' } as unknown as Scheme);
    const store = new LinkBlockEditorStore(params<ILinkData>({ documentId: '' }, c));
    expect(store.registry).toBe(registry);
    expect(store.currentDocumentId).toBe('scheme-7');
  });

  it('setDocumentId replaces the data immutably', () => {
    const initial: ILinkData = { documentId: 'a' };
    const store = new LinkBlockEditorStore(params(initial, container.createChildContainer()));
    store.setDocumentId('b');
    expect(store.getData()).toEqual({ documentId: 'b' });
    expect(initial.documentId).toBe('a');
  });
});

describe('ContourFunctionFooterBlockEditorStore', () => {
  it('starts with the given data and updates it', () => {
    const store = new ContourFunctionFooterBlockEditorStore(params('ret', container.createChildContainer()));
    expect(store.getData()).toBe('ret');
    store.setValue('other');
    expect(store.getData()).toBe('other');
  });
});

describe('stripTags', () => {
  it('removes html tags but keeps text', () => {
    expect(stripTags('<p>a <b>b</b></p>')).toBe('a b');
    expect(stripTags('a < b')).toBe('a < b');
  });
});

describe('HtmlBlockEditorStore', () => {
  it('returns the initial html until a lexical editor is attached', () => {
    const store = new HtmlBlockEditorStore(params('<p>x</p>', container.createChildContainer()));
    expect(store.getData()).toBe('<p>x</p>');
    store.dispose();
    expect(store.lexicalEditor).toBeNull();
  });

  it('returns an empty string when the initial data is not a string', () => {
    const store = new HtmlBlockEditorStore(params(null as unknown as string, container.createChildContainer()));
    expect(store.getData()).toBe('');
  });
});

describe('ProjectDocumentsRegistryStore', () => {
  const doc = (id: string) => ({ id, name: id, type: 'function' }) as unknown as IProjectTreeDocument;
  it('replaces the whole document list on setDocuments and clears on dispose', () => {
    const registry = new ProjectDocumentsRegistryStore();
    registry.setDocuments([doc('a'), doc('b')]);
    expect([...registry.documents.keys()]).toEqual(['a', 'b']);
    registry.setDocuments([doc('c')]);
    expect([...registry.documents.keys()]).toEqual(['c']);
    registry.dispose();
    expect(registry.documents.size).toBe(0);
  });
});
