import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../../scheme/scheme.js';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import { insertNode } from '../../actions/insert-node.js';
import { CMD_SET_META } from '../../scheme/scheme-commands.js';
import { setOutNode } from '../../actions/set-out-node.js';
import { checker } from '../../checker.js';
import { WhileIconStore } from './while.icon.store.js';

describe('WhileIconStore.trueIsMain', () => {
  // oxlint-disable-next-line init-declarations
  let infra: ReturnType<typeof getTestInfrastructure>;
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let whileNodeId: string;

  beforeEach(() => {
    infra = getTestInfrastructure();
    scheme = schemeFactory({
      infra,
      modules: [],
      document: getTestEmptyDoc(),
    });
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const whileNode = scheme.infra.structure.factory('while');
    insertNode({ index: 0, node: whileNode, parentId: bodyNodeId }, scheme);
    whileNodeId = whileNode.id;
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('defaults to false (true repeats the loop, `while (cond)`) when the node has no meta', () => {
    const icon = scheme.icons.getIcon(whileNodeId);
    assert.instanceOf(icon, WhileIconStore);
    assert.isTrue(checker.isWhile(icon));
    assert.equal(icon.trueIsMain, false);
  });

  it('flags the icon store with IconFlags.While', () => {
    const icon = scheme.icons.getIcon(whileNodeId);
    assert.isTrue(checker.isWhile(icon));
    assert.isFalse(checker.isIf(icon));
  });

  it('reactively reflects a CMD_SET_META update instead of the value cached at construction time', () => {
    const icon = scheme.icons.getIcon(whileNodeId);
    assert.instanceOf(icon, WhileIconStore);
    assert.equal(icon.trueIsMain, false);

    scheme.commands.dispatchCommand(CMD_SET_META, { id: whileNodeId, meta: { trueIsMain: true } });
    assert.equal(icon.trueIsMain, true);

    scheme.commands.dispatchCommand(CMD_SET_META, { id: whileNodeId, meta: { trueIsMain: false } });
    assert.equal(icon.trueIsMain, false);
  });
});

describe('WhileIconStore break line', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let whileNodeId: string;

  beforeEach(() => {
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [],
      document: getTestEmptyDoc(),
    });
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');
    const whileNode = scheme.infra.structure.factory('while');
    insertNode({ index: 0, node: whileNode, parentId: bodyNodeId }, scheme);
    whileNodeId = whileNode.id;
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('sees a level-1 break from a nested `if` branch as its own break (draws the line to the loop exit)', () => {
    const ifNode = scheme.infra.structure.factory('if');
    insertNode({ index: 0, node: ifNode, parentId: whileNodeId }, scheme);
    const [, secondBranch] = scheme.nodes.getNode(ifNode.id).children;
    setOutNode({ id: secondBranch.id, outNode: scheme.infra.structure.factory('out-break') }, scheme);

    const icon = scheme.icons.getIcon(whileNodeId);
    assert.instanceOf(icon, WhileIconStore);
    assert.isTrue(icon.hasBreak);
    assert.lengthOf(icon.myBreaksLines, 1);
    assert.equal(icon.myBreaksLines[0].type, 'break');
    // The loop's own level-1 break never leaks out past the loop itself.
    assert.isFalse(icon.skewer.outLines.some((line) => line.type === 'break'));
  });
});
