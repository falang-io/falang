import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { EXTERNAL_API_STRUCTURE_NAME } from '@falang/typescript-dto';
import { buildExternalApiRegistry } from './external-api-registry.js';
import type { IFunctionBodyParameter } from './function-signature.js';

/** Minimal `external-api-structure` document tree — same root/header/body/thread/child shape `mindTreeCfg` produces, hand-built here since only the shape this registry reads matters for this test. */
const externalApiStructureDocument = (
  documentId: string,
  apis: {
    id: string;
    name: string;
    endpoints: { id: string; name: string; parameters: readonly IFunctionBodyParameter[]; returnValue?: unknown }[];
  }[],
): IProjectDocument => {
  const root: INode = {
    id: 'root',
    name: EXTERNAL_API_STRUCTURE_NAME,
    children: [
      { id: 'header', name: `${EXTERNAL_API_STRUCTURE_NAME}-header`, data: '' },
      {
        id: 'body',
        name: `${EXTERNAL_API_STRUCTURE_NAME}-body`,
        data: null,
        children: apis.map((api) => ({
          id: api.id,
          name: `${EXTERNAL_API_STRUCTURE_NAME}-thread`,
          data: { name: api.name },
          children: api.endpoints.map((endpoint) => ({
            id: endpoint.id,
            name: `${EXTERNAL_API_STRUCTURE_NAME}-child`,
            data: { name: endpoint.name, parameters: endpoint.parameters, returnValue: endpoint.returnValue },
          })),
        })),
      },
    ],
  };
  return { id: documentId, type: EXTERNAL_API_STRUCTURE_NAME, name: documentId, root };
};

describe('buildExternalApiRegistry', () => {
  it('maps each api thread id to its endpoint ids and each endpoint id to its signature', () => {
    const document = externalApiStructureDocument('doc-1', [
      {
        id: 'api-1',
        name: 'Sum',
        endpoints: [
          {
            id: 'endpoint-1',
            name: 'NumberSum',
            parameters: [
              { name: 'a', type: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } } },
            ],
            returnValue: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } },
          },
        ],
      },
    ]);

    const { apis, endpoints } = buildExternalApiRegistry([document]);

    expect(apis.get('api-1')).toEqual({
      name: 'Sum',
      endpointIds: ['endpoint-1'],
      documentId: 'doc-1',
      documentName: 'doc-1',
    });
    expect(endpoints.get('endpoint-1')).toEqual({
      apiId: 'api-1',
      apiName: 'Sum',
      name: 'NumberSum',
      parameters: [{ name: 'a', type: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } } }],
      returnValue: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } },
      documentId: 'doc-1',
      documentName: 'doc-1',
    });
  });

  it('aggregates APIs across multiple external-api-structure documents and ignores other document types', () => {
    const docA = externalApiStructureDocument('doc-a', [{ id: 'api-a', name: 'Api1', endpoints: [] }]);
    const docB = externalApiStructureDocument('doc-b', [{ id: 'api-b', name: 'Api2', endpoints: [] }]);
    const functionDoc: IProjectDocument = { id: 'doc-fn', type: 'function', name: 'fn' };

    const { apis } = buildExternalApiRegistry([docA, docB, functionDoc]);

    expect([...apis.entries()]).toEqual(
      expect.arrayContaining([
        ['api-a', { name: 'Api1', endpointIds: [], documentId: 'doc-a', documentName: 'doc-a' }],
        ['api-b', { name: 'Api2', endpointIds: [], documentId: 'doc-b', documentName: 'doc-b' }],
      ]),
    );
  });
});
