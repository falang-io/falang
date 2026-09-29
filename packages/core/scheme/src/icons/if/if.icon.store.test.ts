import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../../scheme/scheme.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { insertNode } from '../../actions/insert-node.js';
import { CMD_SET_META } from '../../scheme/scheme-commands.js';
import { checker } from '../../checker.js';
import { IfIconStore } from './if.icon.store.js';

describe('IfIconStore.trueOnRight', () => {
  // oxlint-disable-next-line init-declarations
  let infra: ReturnType<typeof getTestInfrastructure>;
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let ifNodeId: string;

  beforeEach(() => {
    infra = getTestInfrastructure();
    scheme = schemeFactory({
      infra,
      modules: [],
      document: getTestEmptyDoc(),
    });
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: bodyNodeId }, scheme);
    ifNodeId = ifNode.id;
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('defaults to false (then = children[0], the straight-down branch) when the node has no meta', () => {
    const icon = scheme.icons.getIcon(ifNodeId);
    assert.instanceOf(icon, IfIconStore);
    assert.isTrue(checker.isIf(icon));
    assert.equal(icon.trueOnRight, false);
  });

  it('flags the icon store with IconFlags.If', () => {
    const icon = scheme.icons.getIcon(ifNodeId);
    assert.isTrue(checker.isIf(icon));
    assert.isFalse(checker.isWhile(icon));
  });

  it('reactively reflects a CMD_SET_META update instead of the value cached at construction time', () => {
    const icon = scheme.icons.getIcon(ifNodeId);
    assert.instanceOf(icon, IfIconStore);
    assert.equal(icon.trueOnRight, false);

    scheme.commands.dispatchCommand(CMD_SET_META, { id: ifNodeId, meta: { trueOnRight: true } });
    assert.equal(icon.trueOnRight, true);

    scheme.commands.dispatchCommand(CMD_SET_META, { id: ifNodeId, meta: { trueOnRight: false } });
    assert.equal(icon.trueOnRight, false);
  });
});
