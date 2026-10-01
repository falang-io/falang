import { assert, afterEach, beforeEach, describe, it } from 'vitest';
import type { Scheme } from '../scheme/scheme.js';
import { getTestInfrastructure } from '../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../scheme/scheme-factory.js';
import { CMD_SET_META } from '../scheme/scheme-commands.js';
import { EVENT_META_UPDATED, EVENT_ONCHANGE } from '../scheme/scheme-events.js';

describe('setMeta', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;

  beforeEach(() => {
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      document: getTestEmptyDoc(),
    });
  });

  afterEach(() => {
    scheme.dispose();
  });

  it('fires EVENT_ONCHANGE, so a meta-only edit reaches autosave', () => {
    const bodyId = scheme.rootNode?.children[1].id;
    if (!bodyId) throw new Error('Root not set');
    const changes: string[] = [];
    scheme.events.subscribeEvent(EVENT_ONCHANGE, ({ event }) => {
      changes.push(event);
      return false;
    });

    scheme.commands.dispatchCommand(CMD_SET_META, { id: bodyId, meta: { width: 300 } });

    assert.deepEqual(scheme.nodes.getNode(bodyId).meta, { width: 300 });
    assert.deepEqual(changes, [EVENT_META_UPDATED.type]);
  });
});
