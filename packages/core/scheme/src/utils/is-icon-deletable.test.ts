import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { insertNode } from '../actions/insert-node.js';
import { isIconDeletable } from './is-icon-deletable.js';

describe('isIconDeletable', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;

  beforeEach(() => {
    scheme = schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() });
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('is true for a mod and for a statement in a body', () => {
    const bodyId = scheme.rootNode?.children[1].id;
    if (!bodyId) throw new Error('Root not set');
    const host = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: host, parentId: bodyId }, scheme);
    const mod = scheme.infra.structure.factory('mod1');
    insertNode({ index: 0, node: mod, parentId: host.id, slot: 'mods' }, scheme);
    assert.isTrue(isIconDeletable(scheme, mod.id));
    assert.isTrue(isIconDeletable(scheme, host.id));
  });
});
