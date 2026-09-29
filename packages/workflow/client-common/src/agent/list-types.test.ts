import { describe, expect, it } from 'vitest';
import type { IIntegrationStructType, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { LIST_TYPES_FULL_LIMIT, LIST_TYPES_INDEX_LIMIT, listTypes } from './list-types.js';

const vendorWithTypes = (vendor: string, count: number): IWorkflowIntegration =>
  ({
    types: Array.from({ length: count }, (_, i) => ({
      id: `${vendor}/Type${i}`,
      name: i === 0 ? 'Product' : `Type${i}`,
      properties: { field: { type: 'string' } },
    })),
    vendor,
  }) as unknown as IWorkflowIntegration;

const instanceTypesFixture = (instanceId: string, count: number): IIntegrationStructType[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `db:${instanceId}:table${i}`,
    name: i === 0 ? 'Product' : `Table${i}`,
    properties: { id: { type: 'string' } },
  }));

const project = [{ documentId: 'doc', id: 'thread-1', name: 'GameState', properties: {} }];

interface IResult {
  types: { id: string }[];
  typeIndex?: { id: string }[];
  notes?: string[];
  notFound?: string[];
}

const run = (
  input: unknown,
  integrations: IWorkflowIntegration[],
  inUse: string[],
  instanceTypes: readonly IIntegrationStructType[] = [],
) =>
  listTypes({
    input,
    integrations,
    instanceTypes,
    projectTypes: project,
    vendorsInUse: new Set(inUse),
  }) as IResult;

describe('listTypes', () => {
  it('always lists project types; vendor types only for vendors in use', () => {
    const result = run({}, [vendorWithTypes('small', 2), vendorWithTypes('unused', 2)], ['small']);
    expect(result.types.map((type) => type.id)).toEqual(['thread-1', 'small/Type0', 'small/Type1']);
  });

  it('indexes (id/name only) a vendor with more than a few types, counts one with very many', () => {
    const mid = LIST_TYPES_FULL_LIMIT + 1;
    const huge = LIST_TYPES_INDEX_LIMIT + 1;
    const result = run({}, [vendorWithTypes('mid', mid), vendorWithTypes('huge', huge)], ['mid', 'huge']);
    expect(result.typeIndex).toHaveLength(mid);
    expect(result.typeIndex?.[0]).toEqual({ id: 'mid/Type0', name: 'Product', vendor: 'mid' });
    expect(result.notes?.[0]).toContain(`"huge": ${huge} types`);
  });

  it('keywords narrow a big vendor down by type id/name', () => {
    const result = run({ keywords: ['product'] }, [vendorWithTypes('huge', 500)], ['huge']);
    expect(result.types.map((type) => type.id)).toEqual(['thread-1', 'huge/Type0']);
  });

  it('ids return exactly those full definitions, from any vendor, and report unknown ids', () => {
    const result = run({ ids: ['unused/Type1', 'nope'] }, [vendorWithTypes('unused', 3)], []);
    expect(result.types).toEqual([
      { id: 'unused/Type1', name: 'Type1', properties: { field: { type: 'string' } }, vendor: 'unused' },
    ]);
    expect(result.notFound).toEqual(['nope']);
  });

  describe('instanceTypes (ADR 0039 (private) §5)', () => {
    it('always lists them alongside project types, in full when few — no vendorsInUse filter applies', () => {
      const result = run({}, [], [], instanceTypesFixture('db-1', 2));
      expect(result.types.map((type) => type.id)).toEqual(['thread-1', 'db:db-1:table0', 'db:db-1:table1']);
    });

    it('indexes many, counts very many, same thresholds as vendor types', () => {
      const mid = LIST_TYPES_FULL_LIMIT + 1;
      const huge = LIST_TYPES_INDEX_LIMIT + 1;
      const midResult = run({}, [], [], instanceTypesFixture('db-1', mid));
      expect(midResult.typeIndex).toHaveLength(mid);
      expect(midResult.typeIndex?.[0]).toEqual({ id: 'db:db-1:table0', name: 'Product' });

      const hugeResult = run({}, [], [], instanceTypesFixture('db-1', huge));
      expect(hugeResult.notes?.[0]).toContain(`${huge} types`);
    });

    it('keywords narrow instance types down by id/name, same as vendor types', () => {
      const result = run({ keywords: ['product'] }, [], [], instanceTypesFixture('db-1', 20));
      expect(result.types.map((type) => type.id)).toEqual(['thread-1', 'db:db-1:table0']);
    });

    it('ids fetch instance types too', () => {
      const result = run({ ids: ['db:db-1:table1'] }, [], [], instanceTypesFixture('db-1', 3));
      expect(result.types).toEqual([{ id: 'db:db-1:table1', name: 'Table1', properties: { id: { type: 'string' } } }]);
    });

    it('defaults to empty when omitted entirely', () => {
      const result = listTypes({
        input: {},
        integrations: [],
        projectTypes: project,
        vendorsInUse: new Set(),
      }) as IResult;
      expect(result.types.map((type) => type.id)).toEqual(['thread-1']);
    });
  });
});
