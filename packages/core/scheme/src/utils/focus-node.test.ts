import { resolveService } from '@falang/di';
import { assert, describe, it } from 'vitest';
import { TOKEN_CSS_CLASSES, TOKEN_SELECTION } from '../di-tokens.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { focusNode } from './focus-node.js';

describe('focusNode', () => {
  it('selects the node and pans the view to it, returning true', () => {
    const scheme = schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() });
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');

    const result = focusNode(scheme, bodyNodeId);

    assert.equal(result, true);
    const selection = resolveService(TOKEN_SELECTION, scheme.container);
    assert.equal(selection.isSelected(bodyNodeId), true);
    assert.equal(selection.isInSelected(bodyNodeId), true);
    // The actual visible border comes from this class (see `BlockView`), not `SelectionStore`.
    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    assert.equal(cssClasses.getBlockBodyClassName(bodyNodeId), 'block-body selected');
    scheme.dispose();
  });

  it('clears the previous selection before selecting the new node', () => {
    const scheme = schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() });
    const [headerId, bodyId, footerId] = scheme.rootNode?.children.map((child) => child.id) ?? [];
    if (!headerId || !bodyId || !footerId) throw new Error('Root not set');

    focusNode(scheme, headerId);
    focusNode(scheme, bodyId);

    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    assert.equal(cssClasses.getBlockBodyClassName(headerId), 'block-body');
    assert.equal(cssClasses.getBlockBodyClassName(bodyId), 'block-body selected');
    scheme.dispose();
  });

  it('returns false without throwing for a node id with no icon', () => {
    const scheme = schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() });
    assert.equal(focusNode(scheme, 'does-not-exist'), false);
    scheme.dispose();
  });
});
