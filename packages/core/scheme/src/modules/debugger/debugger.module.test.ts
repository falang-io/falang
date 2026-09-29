import { assert, beforeEach, afterEach, describe, it } from 'vitest';
import { resolveService } from '@falang/di';
import { runInAction } from 'mobx';
import type { IDebugAdapter, TDebugEvent, TDebugEventListener } from '@falang/debug';
import { getTestInfrastructure } from '../../../test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '../../../test-utils/get-test-empty-doc.js';
import { schemeFactory } from '../../scheme/scheme-factory.js';
import type { Scheme } from '../../scheme/scheme.js';
import { insertNode } from '../../actions/insert-node.js';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import { ContextMenuModule } from '../context-menu/context-menu.module.js';
import { TOKEN_CONTEXT_MENU } from '../context-menu/context-menu.service.token.js';
import { DebugSessionStore } from './debug-session.store.js';
import { DEBUG_CURRENT_BLOCK_CLASS, DebuggerModule } from './debugger.module.js';
import { TOKEN_DEBUGGER } from './debugger.service.token.js';
import { CMD_TOGGLE_BREAKPOINT } from './debugger.command.js';

class ManualAdapter implements IDebugAdapter {
  private listener: TDebugEventListener | null = null;
  emit(event: TDebugEvent) {
    this.listener?.(event);
  }
  subscribe(listener: TDebugEventListener) {
    this.listener = listener;
    return () => {
      this.listener = null;
    };
  }
  start() {
    return Promise.resolve();
  }
  setBreakpoints() {
    return Promise.resolve();
  }
  resume() {
    return Promise.resolve();
  }
  stop() {
    return Promise.resolve();
  }
}

const DOC_ID = 'doc-1';

describe('DebuggerModule', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let session: DebugSessionStore;
  // oxlint-disable-next-line init-declarations
  let adapter: ManualAdapter;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;
  // oxlint-disable-next-line init-declarations
  let actionId: string;

  beforeEach(() => {
    adapter = new ManualAdapter();
    session = new DebugSessionStore(adapter);
    scheme = schemeFactory({
      infra: getTestInfrastructure(),
      modules: [new ContextMenuModule(), new DebuggerModule({ session, documentId: DOC_ID })],
      document: getTestEmptyDoc(),
    });
    const foundBodyId = scheme.rootNode?.children[1].id;
    if (!foundBodyId) throw new Error('Root not set');
    bodyId = foundBodyId;
    const action = scheme.infra.structure.factory('action');
    actionId = action.id;
    runInAction(() => {
      insertNode({ index: 0, node: action, parentId: bodyId }, scheme);
    });
  });

  afterEach(() => {
    scheme.dispose();
    session.dispose();
  });

  it('only statement nodes are breakable, and toggling goes through the shared session', () => {
    const service = resolveService(TOKEN_DEBUGGER, scheme.container);
    assert.equal(service.isBreakable(scheme.icons.getIcon(actionId)), true);
    assert.equal(service.isBreakable(scheme.icons.getIcon(bodyId)), false);

    assert.equal(service.toggleBreakpoint(bodyId), false);
    assert.equal(session.breakpointList.length, 0);

    assert.equal(scheme.commands.dispatchCommand(CMD_TOGGLE_BREAKPOINT, { nodeId: actionId }), true);
    assert.deepEqual(session.breakpointList, [{ documentId: DOC_ID, nodeId: actionId }]);
    assert.equal(service.hasBreakpoint(actionId), true);
    assert.deepEqual(
      service.breakpointIcons.map((icon) => icon.id),
      [actionId],
    );

    scheme.commands.dispatchCommand(CMD_TOGGLE_BREAKPOINT, { nodeId: actionId });
    assert.equal(session.breakpointList.length, 0);
  });

  it("breakpoints of another document are not this scheme's", () => {
    const service = resolveService(TOKEN_DEBUGGER, scheme.container);
    session.toggleBreakpoint({ documentId: 'other-doc', nodeId: actionId });
    assert.equal(service.hasBreakpoint(actionId), false);
    assert.equal(service.breakpointIcons.length, 0);
  });

  it('the paused node gets the debug-current block class only while paused here', () => {
    const service = resolveService(TOKEN_DEBUGGER, scheme.container);
    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    const hasClass = () => cssClasses.getBlockBodyClassName(actionId).split(' ').includes(DEBUG_CURRENT_BLOCK_CLASS);

    adapter.emit({ type: 'started' });
    assert.equal(hasClass(), false);

    adapter.emit({
      type: 'paused',
      location: { documentId: 'other-doc', nodeId: actionId },
      variables: [],
      stack: [],
      reason: 'breakpoint',
    });
    assert.equal(service.currentNodeId, null);
    assert.equal(hasClass(), false);

    adapter.emit({ type: 'resumed' });
    adapter.emit({
      type: 'paused',
      location: { documentId: DOC_ID, nodeId: actionId },
      variables: [],
      stack: [],
      reason: 'step',
    });
    assert.equal(service.currentNodeId, actionId);
    assert.equal(hasClass(), true);

    adapter.emit({ type: 'resumed' });
    assert.equal(service.currentNodeId, null);
    assert.equal(hasClass(), false);
  });

  it("adds a toggle entry to a statement icon's context menu, none to a container", () => {
    const contextMenu = resolveService(TOKEN_CONTEXT_MENU, scheme.container);
    const actionMenu = contextMenu.buildForIcon({ icon: scheme.icons.getIcon(actionId), scheme });
    assert.equal(actionMenu.length, 1);
    const item = actionMenu[0];
    if (item.type !== 'button') throw new Error('expected a button');
    assert.equal(item.text, 'debugger:add-breakpoint');
    item.onClick();
    assert.equal(session.hasBreakpoint({ documentId: DOC_ID, nodeId: actionId }), true);
    const afterMenu = contextMenu.buildForIcon({ icon: scheme.icons.getIcon(actionId), scheme });
    assert.equal(afterMenu[0].text, 'debugger:remove-breakpoint');

    const bodyMenu = contextMenu.buildForIcon({ icon: scheme.icons.getIcon(bodyId), scheme });
    assert.equal(bodyMenu.length, 0);
  });
});
