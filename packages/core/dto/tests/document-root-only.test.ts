import { describe, expect, it } from 'vitest';
import * as zod from 'zod';
import { NodesGroup, NodesStack } from '../src';
import { action, functionCfg } from '../src';

// Regression coverage for a real user-hit bug: a `NodesStack` where a container's `children: true`
// ("any node from the stack") let a document-root-only kind (e.g. `function`) be nested as a statement
// inside its own `function-body`, or — in the workflow product, where `function`/`trigger-function`
// share one stack — a `trigger-function` root nested inside a plain `function` document. See
// `INodeConfig.documentRootOnly`.
describe('documentRootOnly', () => {
  const stringType = { type: zod.string(), default: () => '' };

  const buildStack = () =>
    new NodesStack([
      new NodesGroup([
        action('action', stringType),
        ...functionCfg({ name: 'function', data: stringType, footer: stringType, header: stringType }),
      ]),
    ]);

  it('rejects a document-root-only node (function) nested inside a children: true container', () => {
    const stack = buildStack();
    expect(() =>
      stack.parseNode({
        id: '2',
        name: 'function-body',
        data: '',
        children: [
          {
            id: 'nested-fn',
            name: 'function',
            children: [
              { id: 'h', name: 'function-header', data: '' },
              { id: 'b', name: 'function-body', data: '', children: [] },
              { id: 'f', name: 'function-footer', data: '' },
            ],
          },
        ],
      }),
    ).toThrow();
  });

  it('still accepts an ordinary statement node inside the same children: true container', () => {
    const stack = buildStack();
    expect(() =>
      stack.parseNode({
        id: '2',
        name: 'function-body',
        data: '',
        children: [{ id: '3', name: 'action', data: '' }],
      }),
    ).not.toThrow();
  });

  it('still accepts the document-root-only node as an actual document root', () => {
    const stack = buildStack();
    expect(() =>
      stack.parseDocument({
        id: 'doc-1',
        name: 'fn',
        root: {
          id: 'root',
          name: 'function',
          children: [
            { id: 'h', name: 'function-header', data: '' },
            { id: 'b', name: 'function-body', data: '', children: [] },
            { id: 'f', name: 'function-footer', data: '' },
          ],
        },
      }),
    ).not.toThrow();
  });
});
