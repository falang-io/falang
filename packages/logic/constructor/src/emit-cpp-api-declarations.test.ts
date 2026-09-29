import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { emitCppApiDeclarations, cppApiGlobalName, cppApiInterfaceName } from './emit-cpp-api-declarations.js';
import type { IExternalApiRegistry } from './external-api-registry.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

describe('emitCppApiDeclarations', () => {
  it('emits an abstract class with one pure-virtual method per endpoint, plus an extern global pointer', () => {
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

    const code = emitCppApiDeclarations(registry, new Map());

    expect(code).toContain('struct ISum {');
    expect(code).toContain('virtual ~ISum() {}');
    expect(code).toContain('virtual int NumberSum(int a) = 0;');
    expect(code).toContain('virtual void Ping() = 0;');
    expect(code).toContain('extern ISum* g_Sum;');
  });

  it('emits nothing for a registry with no APIs', () => {
    expect(emitCppApiDeclarations({ apis: new Map(), endpoints: new Map() }, new Map())).toBe('');
  });
});

describe('cppApiInterfaceName / cppApiGlobalName', () => {
  it('derives the interface and global pointer names from the API name', () => {
    expect(cppApiInterfaceName('Sum')).toBe('ISum');
    expect(cppApiGlobalName('Sum')).toBe('g_Sum');
  });
});
