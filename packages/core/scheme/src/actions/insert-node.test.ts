import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { EVENT_NODE_INSERTED } from '../scheme/scheme-events.js';
import { insertNode } from './insert-node.js';

describe('insertNode action', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;
  // oxlint-disable-next-line init-declarations
  let hostId: string;

  beforeEach(() => {
    scheme = schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() });
    const body = scheme.rootNode?.children[1].id;
    if (!body) throw new Error('Root not set');
    bodyId = body;
    const host = scheme.infra.structure.factory('action');
    insertNode({ index: 0, node: host, parentId: bodyId }, scheme);
    hostId = host.id;
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('puts a mod into parent.mods, not children, and builds its icon under the host icon', () => {
    const mod = scheme.infra.structure.factory('mod1');
    insertNode({ index: 0, node: mod, parentId: hostId, slot: 'mods' }, scheme);

    const host = scheme.nodes.getNode(hostId);
    assert.deepEqual(
      host.mods.map((m) => m.id),
      [mod.id],
    );
    assert.equal(host.children.length, 0);
    assert.strictEqual(scheme.nodes.getNode(mod.id).parent, host);
    const modIcon = scheme.icons.getIcon(mod.id);
    assert.strictEqual(modIcon.parent, scheme.icons.getIcon(hostId));
    assert.deepEqual(
      scheme.icons.getIcon(hostId).mods.map((m) => m.id),
      [mod.id],
    );
  });

  it('rejects a kind outside the host policy, a duplicate kind and a host without a policy', () => {
    assert.throws(() =>
      insertNode({ index: 0, node: scheme.infra.structure.factory('action2'), parentId: hostId, slot: 'mods' }, scheme),
    );
    insertNode({ index: 0, node: scheme.infra.structure.factory('mod1'), parentId: hostId, slot: 'mods' }, scheme);
    assert.throws(() =>
      insertNode({ index: 1, node: scheme.infra.structure.factory('mod1'), parentId: hostId, slot: 'mods' }, scheme),
    );
    const noPolicy = scheme.infra.structure.factory('action2');
    insertNode({ index: 1, node: noPolicy, parentId: bodyId }, scheme);
    assert.throws(() =>
      insertNode(
        { index: 0, node: scheme.infra.structure.factory('mod1'), parentId: noPolicy.id, slot: 'mods' },
        scheme,
      ),
    );
    assert.equal(scheme.nodes.getNode(hostId).mods.length, 1);
    assert.equal(scheme.nodes.getNode(noPolicy.id).mods.length, 0);
  });

  it('keeps inserting into children when slot is omitted', () => {
    const child = scheme.infra.structure.factory('action2');
    insertNode({ index: 0, node: child, parentId: bodyId }, scheme);
    assert.equal(scheme.nodes.getNode(bodyId).children[0].id, child.id);
  });

  it('fires EVENT_NODE_INSERTED once with the host as parent', () => {
    const inserted: string[] = [];
    scheme.events.subscribeEvent(EVENT_NODE_INSERTED, ({ node }) => {
      inserted.push(`${node.id}:${node.parent?.id}`);
      return false;
    });
    const mod = scheme.infra.structure.factory('mod1');
    insertNode({ index: 0, node: mod, parentId: hostId, slot: 'mods' }, scheme);
    assert.deepEqual(inserted, [`${mod.id}:${hostId}`]);
  });
});
