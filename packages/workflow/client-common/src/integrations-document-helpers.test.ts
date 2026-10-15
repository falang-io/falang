import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INTEGRATIONS_DOCUMENT_TYPE } from '@falang/workflow-integrations-common';

const api = vi.hoisted(() => ({
  loadIntegrationFieldOptions: vi.fn(),
  loadActivepiecesPieces: vi.fn(),
  loadActivepiecesFieldOptions: vi.fn(),
}));
vi.mock('./api-client.js', () => ({ workflowApi: api }));

const helpers = await import('./integrations-document-helpers.js');

const inst = (id: string) => ({ id, vendor: 'v', name: id }) as never;
const sync = () => ({ scheduleSaveCustomDocument: vi.fn() });

describe('integration instance actions', () => {
  it('saves a new instance and replaces one with the same id', () => {
    const doc = { type: INTEGRATIONS_DOCUMENT_TYPE, customData: { instances: [inst('a'), inst('b')] } } as never;
    const s = sync();
    const updated = { id: 'a', vendor: 'v', name: 'renamed' } as never;
    helpers.saveIntegrationInstanceAction([doc], s as never, updated);
    expect((doc as { customData: { instances: { id: string }[] } }).customData.instances.map((i) => i.id)).toEqual([
      'b',
      'a',
    ]);
    expect(s.scheduleSaveCustomDocument).toHaveBeenCalledWith(doc);
  });

  it('starts from an empty list when the document has no data', () => {
    const doc = { type: INTEGRATIONS_DOCUMENT_TYPE } as never;
    helpers.saveIntegrationInstanceAction([doc], sync() as never, inst('x'));
    expect((doc as { customData: { instances: unknown[] } }).customData.instances).toHaveLength(1);
  });

  it('deletes an instance by id', () => {
    const doc = { type: INTEGRATIONS_DOCUMENT_TYPE, customData: { instances: [inst('a'), inst('b')] } } as never;
    const s = sync();
    helpers.deleteIntegrationInstanceAction([doc], s as never, 'a');
    expect((doc as { customData: { instances: { id: string }[] } }).customData.instances.map((i) => i.id)).toEqual([
      'b',
    ]);
    expect(s.scheduleSaveCustomDocument).toHaveBeenCalledOnce();
  });

  it('does nothing without an integrations document', () => {
    const s = sync();
    helpers.saveIntegrationInstanceAction([{ type: 'function' } as never], s as never, inst('a'));
    helpers.deleteIntegrationInstanceAction([], s as never, 'a');
    expect(s.scheduleSaveCustomDocument).not.toHaveBeenCalled();
  });
});

describe('providers', () => {
  beforeEach(() => Object.values(api).forEach((f) => f.mockReset()));

  it('field options provider binds the project id', async () => {
    api.loadIntegrationFieldOptions.mockResolvedValue(['o']);
    const p = helpers.createFieldOptionsProvider('p1');
    expect(await p.loadOptions('vendor', 'cred', 'act', 'field')).toEqual(['o']);
    expect(api.loadIntegrationFieldOptions).toHaveBeenCalledWith('p1', 'cred', 'act', 'field');
  });

  it('activepieces catalog provider is not project scoped', async () => {
    api.loadActivepiecesPieces.mockResolvedValue([1]);
    expect(await helpers.createActivepiecesCatalogProvider().getPieces()).toEqual([1]);
    expect(api.loadActivepiecesPieces).toHaveBeenCalledWith();
  });

  it('activepieces field options provider binds the project id', async () => {
    api.loadActivepiecesFieldOptions.mockResolvedValue([]);
    await helpers.createActivepiecesFieldOptionsProvider('p1').loadOptions('c', 'piece', 'a', 'f', { k: 1 });
    expect(api.loadActivepiecesFieldOptions).toHaveBeenCalledWith('p1', 'c', 'piece', 'a', 'f', { k: 1 });
  });
});
