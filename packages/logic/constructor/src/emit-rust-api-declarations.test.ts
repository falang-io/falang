import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { emitRustApisTrait, rustApiMethodName } from './emit-rust-api-declarations.js';
import type { IExternalApiRegistry } from './external-api-registry.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

describe('emitRustApisTrait', () => {
  it('emits one flattened pub trait Apis with a &mut self method per endpoint, named <ApiDoc>_<Group>_<Endpoint>', () => {
    const registry: IExternalApiRegistry = {
      apis: new Map([
        ['api-1', { name: 'Sum', endpointIds: ['ep-1', 'ep-2'], documentId: 'doc-1', documentName: 'GameApi' }],
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
            documentId: 'doc-1',
            documentName: 'GameApi',
          },
        ],
        [
          'ep-2',
          {
            apiId: 'api-1',
            apiName: 'Sum',
            name: 'Ping',
            parameters: [],
            documentId: 'doc-1',
            documentName: 'GameApi',
          },
        ],
      ]),
    };

    const code = emitRustApisTrait(registry, new Map(), new Map());

    expect(code).toContain('pub trait Apis {');
    expect(code).toContain('fn GameApi_Sum_NumberSum(&mut self, a: i32) -> i32;');
    expect(code).toContain('fn GameApi_Sum_Ping(&mut self);');
  });

  it('struct/array-typed parameters render as & references (by-value scalars unaffected)', () => {
    const structNames = new Map([['thread-1', 'Color']]);
    const structDocuments = new Map([['thread-1', 'State']]);
    const registry: IExternalApiRegistry = {
      apis: new Map([
        ['api-1', { name: 'Drawing', endpointIds: ['ep-1'], documentId: 'doc-1', documentName: 'GameApi' }],
      ]),
      endpoints: new Map([
        [
          'ep-1',
          {
            apiId: 'api-1',
            apiName: 'Drawing',
            name: 'DrawRect',
            parameters: [{ name: 'color', type: { type: 'struct', id: 'thread-1' } }],
            documentId: 'doc-1',
            documentName: 'GameApi',
          },
        ],
      ]),
    };

    const code = emitRustApisTrait(registry, structNames, structDocuments);
    expect(code).toContain('fn GameApi_Drawing_DrawRect(&mut self, color: &crate::falang::State::Color);');
  });

  it('still emits an empty pub trait Apis {} for a registry with no APIs — every compiled function takes _apis unconditionally', () => {
    expect(emitRustApisTrait({ apis: new Map(), endpoints: new Map() }, new Map(), new Map())).toBe(
      'pub trait Apis {\n}',
    );
  });
});

describe('rustApiMethodName', () => {
  it('joins <ApiDoc>_<Group>_<Endpoint>', () => {
    expect(
      rustApiMethodName({
        apiId: 'api-1',
        apiName: 'Drawing',
        name: 'DrawRect',
        parameters: [],
        documentId: 'doc-1',
        documentName: 'GameApi',
      }),
    ).toBe('GameApi_Drawing_DrawRect');
  });
});
