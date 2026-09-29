import { resolveService } from '@falang/di';
import { observable, runInAction } from 'mobx';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { insertNode } from '../../actions/insert-node.js';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import type { Scheme } from '../../scheme/scheme.js';
import {
  EXECUTION_CURRENT_CLASS,
  ExecutionPositionModule,
  type IExecutionLocation,
  type IExecutionPositionSource,
} from './execution-position.module.js';

describe('ExecutionPositionModule', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let source: IExecutionPositionSource & { location: IExecutionLocation | null };
  // oxlint-disable-next-line init-declarations
  let nodeId: string;
  let disposed = false;

  const blockClasses = (id: string): string =>
    resolveService(TOKEN_CSS_CLASSES, scheme.container).getBlockBodyClassName(id);

  beforeEach(() => {
    source = observable({ location: null as IExecutionLocation | null });
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new ExecutionPositionModule(source, { follow: false })],
      id: 'doc-a',
      document: getTestEmptyDoc(),
    });
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const node = scheme.infra.structure.factory('action');
    nodeId = node.id;
    runInAction(() => {
      insertNode({ index: 0, node, parentId: bodyNodeId }, scheme);
    });
  });

  afterEach(() => {
    if (!disposed) scheme.dispose();
    disposed = false;
  });

  it('marks the current node when the location points into this scheme', () => {
    runInAction(() => {
      source.location = { documentId: 'doc-a', nodeId };
    });
    expect(blockClasses(nodeId)).toContain(EXECUTION_CURRENT_CLASS);
  });

  it('clears the mark when the location moves to another document or goes away', () => {
    runInAction(() => {
      source.location = { documentId: 'doc-a', nodeId };
    });
    runInAction(() => {
      source.location = { documentId: 'doc-b', nodeId: 'elsewhere' };
    });
    expect(blockClasses(nodeId)).not.toContain(EXECUTION_CURRENT_CLASS);

    runInAction(() => {
      source.location = { documentId: 'doc-a', nodeId };
    });
    runInAction(() => {
      source.location = null;
    });
    expect(blockClasses(nodeId)).not.toContain(EXECUTION_CURRENT_CLASS);
  });

  it('stops reacting once the scheme is disposed', () => {
    // Resolved before disposal — the container refuses lookups afterwards.
    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    scheme.dispose();
    disposed = true;
    runInAction(() => {
      source.location = { documentId: 'doc-a', nodeId };
    });
    expect(cssClasses.getBlockBodyClassName(nodeId)).not.toContain(EXECUTION_CURRENT_CLASS);
  });
});
