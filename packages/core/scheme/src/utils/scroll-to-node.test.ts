import { afterEach, assert, describe, it, vi } from 'vitest';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { scrollToNode } from './scroll-to-node.js';

describe('scrollToNode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false without throwing for a node id with no icon', () => {
    const scheme = schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() });
    assert.equal(scrollToNode(scheme, 'does-not-exist'), false);
    scheme.dispose();
  });

  it('pans the view and returns true when this scheme is not the only one and its root div is mounted', () => {
    const scheme = schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() });
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');

    const stubElement = { getBoundingClientRect: () => ({ height: 768, width: 1024, x: 0, y: 0 }) };
    vi.stubGlobal('document', {
      querySelector: (selector: string) => (selector === `#${scheme.rootDivId}` ? stubElement : null),
    });

    assert.equal(scrollToNode(scheme, bodyNodeId), true);
    scheme.dispose();
  });

  // A background document's `Scheme` (open in a tab that isn't the currently *active* one) has no
  // mounted root div at all — `ProjectWorkspace` renders only the active tab's `SchemeView`. Without
  // this guard, `Scheme.getDomRect()`'s own "element not found" throw aborts the whole caller; this
  // is exactly what ADR 0034's cross-document agent hit switching tabs mid-run and then coming back
  // to mutate the document it started on.
  it('returns false without throwing when this scheme has an icon but its root div is not mounted', () => {
    const scheme = schemeFactory({ infra: getTestInfrastructure(), document: getTestEmptyDoc() });
    const bodyNodeId = scheme.rootNode?.children[1].id;
    if (!bodyNodeId) throw new Error('Root not set');

    vi.stubGlobal('document', { querySelector: () => null });

    assert.equal(scrollToNode(scheme, bodyNodeId), false);
    scheme.dispose();
  });
});
