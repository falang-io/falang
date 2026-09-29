import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { emitSharpApiDeclarations, sharpApiFieldName, sharpApiInterfaceName } from './emit-sharp-api-declarations.js';
import type { IExternalApiRegistry } from './external-api-registry.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

describe('emitSharpApiDeclarations', () => {
  it('emits an interface with one method per endpoint, plus a Program static field line', () => {
    const registry: IExternalApiRegistry = {
      apis: new Map([
        ['api-1', { name: 'Sum', endpointIds: ['ep-1', 'ep-2'], documentId: 'doc-api', documentName: 'Api1' }],
      ]),
      endpoints: new Map([
        [
          'ep-1',
          {
            apiId: 'api-1',
            apiName: 'Sum',
            name: 'NumberSum',
            parameters: [{ name: 'a', type: int32Type }],
            returnValue: int32Type,
            documentId: 'doc-api',
            documentName: 'Api1',
          },
        ],
        [
          'ep-2',
          { apiId: 'api-1', apiName: 'Sum', name: 'Ping', parameters: [], documentId: 'doc-api', documentName: 'Api1' },
        ],
      ]),
    };

    const { interfaces, fields } = emitSharpApiDeclarations(registry, new Map());

    expect(interfaces).toContain('public interface ISum {');
    expect(interfaces).toContain('int NumberSum(int a);');
    expect(interfaces).toContain('void Ping();');
    expect(fields).toBe('public static ISum Sum;');
  });

  it('emits nothing for a registry with no APIs', () => {
    expect(emitSharpApiDeclarations({ apis: new Map(), endpoints: new Map() }, new Map())).toEqual({
      interfaces: '',
      fields: '',
    });
  });
});

describe('sharpApiInterfaceName / sharpApiFieldName', () => {
  it('derives the interface and field names from the API name', () => {
    expect(sharpApiInterfaceName('Sum')).toBe('ISum');
    expect(sharpApiFieldName('Sum')).toBe('Sum');
  });
});
