import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { emitGoApiDeclarations, goApiGlobalName, goApiInterfaceName } from './emit-go-api-declarations.js';
import type { IExternalApiRegistry } from './external-api-registry.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

describe('emitGoApiDeclarations', () => {
  it('emits an interface with one method per endpoint, plus a package-level variable', () => {
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

    const code = emitGoApiDeclarations(registry, new Map());

    expect(code).toContain('type ISum interface {');
    expect(code).toContain('NumberSum(a int32) int32');
    expect(code).toContain('Ping()');
    expect(code).toContain('var GSum ISum');
  });

  it('emits nothing for a registry with no APIs', () => {
    expect(emitGoApiDeclarations({ apis: new Map(), endpoints: new Map() }, new Map())).toBe('');
  });
});

describe('goApiInterfaceName / goApiGlobalName', () => {
  it('derives the interface and global variable names from the API name', () => {
    expect(goApiInterfaceName('Sum')).toBe('ISum');
    expect(goApiGlobalName('Sum')).toBe('GSum');
  });
});
