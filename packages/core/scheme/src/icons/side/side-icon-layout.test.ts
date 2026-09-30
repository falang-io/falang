import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../../scheme/scheme.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { insertNode } from '../../actions/insert-node.js';
import { deleteNode } from '../../actions/delete-node.js';
import { CELL_SIZE } from '../../constants.js';
import { checker } from '../../checker.js';
import type { SideIconStore } from './side.icon.js';

describe('side icon (mod) layout', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;

  beforeEach(() => {
    scheme = schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() });
    const body = scheme.rootNode?.children[1].id;
    if (!body) throw new Error('Root not set');
    bodyId = body;
  });

  afterEach(() => {
    scheme.dispose();
  });

  const addHost = (name: string) => {
    const host = scheme.infra.structure.factory(name);
    insertNode({ index: 0, node: host, parentId: bodyId }, scheme);
    return scheme.icons.getIcon(host.id);
  };
  const addMod = (hostId: string): SideIconStore => {
    const mod = scheme.infra.structure.factory('mod1');
    insertNode({ index: 0, node: mod, parentId: hostId, slot: 'mods' }, scheme);
    const icon = scheme.icons.getIcon(mod.id);
    if (!checker.isSide(icon)) throw new Error('Expected a side icon');
    return icon;
  };

  it('widens only the left of an action host and puts the mod beside the block', () => {
    const host = addHost('action');
    const ownLeft = host.blockOwnLeft;
    const rightBefore = host.right;
    assert.equal(host.left, ownLeft);

    const mod = addMod(host.id);
    host.blockHeight = 4 * CELL_SIZE;
    mod.blockHeight = 2 * CELL_SIZE;
    assert.equal(host.left, ownLeft + CELL_SIZE + mod.left + mod.right);
    assert.equal(host.right, rightBefore);
    assert.equal(host.modsRight, 0);
    assert.equal(mod.x, host.x - host.blockOwnLeft - CELL_SIZE - mod.right);
    assert.equal(mod.y, host.y + host.blockPosition.y + host.config.shape.paddings.top);

    const [line] = mod.ownLines;
    assert.equal(mod.x + line.x2, host.x - host.blockOwnLeft);
    assert.equal(line.x1, mod.blockFullRight);
    assert.equal(line.y1, line.y2);
    assert.equal(line.y1, 2 * CELL_SIZE);

    deleteNode({ id: mod.id }, scheme);
    assert.equal(host.left, ownLeft);
  });

  it.each(['while', 'cycle'])('widens the left of a %s host by the same amount', (name) => {
    const host = addHost(name);
    const before = host.left;
    const mod = addMod(host.id);
    assert.equal(host.left, before + CELL_SIZE + mod.left + mod.right);
    deleteNode({ id: mod.id }, scheme);
    assert.equal(host.left, before);
  });
});
