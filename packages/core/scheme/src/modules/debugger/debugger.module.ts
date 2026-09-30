import { resolveService } from '@falang/di';
import { reaction } from 'mobx';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { resolveVisibleIconId } from '../../utils/resolve-visible-icon-id.js';
import { scrollToNode } from '../../utils/scroll-to-node.js';
import { TOKEN_CONTEXT_MENU } from '../context-menu/context-menu.service.token.js';
import { BREAKPOINT_DOT_SIZE, BreakpointsLayer } from './breakpoints.layer.js';
import { CMD_TOGGLE_BREAKPOINT } from './debugger.command.js';
import { DebuggerService, type IDebuggerServiceParams } from './debugger.service.js';
import { TOKEN_DEBUGGER } from './debugger.service.token.js';

export const DEBUG_CURRENT_BLOCK_CLASS = 'debug-current';

const debuggerCss = `
  .debug-breakpoints-layer .debug-breakpoint {
    position: absolute;
    width: ${BREAKPOINT_DOT_SIZE}px;
    height: ${BREAKPOINT_DOT_SIZE}px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 2px solid #d93025;
    background: transparent;
    z-index: 1000;
    cursor: pointer;
  }
  .debug-breakpoints-layer .debug-breakpoint.armed {
    background: #d93025;
  }
  /* A shape is either a plain div (rectangleShape & co.) or an svg path; the doubled class
     out-specifies BlockShapeContainer's own .selected rules so a paused node that's also selected
     still shows the debugger's colour. */
  div.block-body.${DEBUG_CURRENT_BLOCK_CLASS}.${DEBUG_CURRENT_BLOCK_CLASS} {
    border-color: #f5a623;
    box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.45);
  }
  svg .block-body.${DEBUG_CURRENT_BLOCK_CLASS}.${DEBUG_CURRENT_BLOCK_CLASS} {
    stroke: #f5a623;
    stroke-width: 3px;
  }
`;

export type IDebuggerModuleParams = IDebuggerServiceParams;

/**
 * The shared debugger UI for one scheme (ADR 0021 §3): breakpoint dots as a scheme layer, a
 * "Toggle breakpoint" context-menu entry (only when a `ContextMenuModule` is present), the
 * `CMD_TOGGLE_BREAKPOINT` command, and a `debug-current` block class + pan that follow the shared
 * `DebugSessionStore`'s paused location whenever it points into this document. Pass the same
 * `session` instance to every scheme of a project; keyboard shortcuts are the host's job.
 */
export class DebuggerModule implements IModule {
  private readonly params: IDebuggerModuleParams;
  private disposers: (() => void)[] = [];

  constructor(params: IDebuggerModuleParams) {
    this.params = params;
  }

  register(scheme: Scheme) {
    scheme.container.registerInstance(TOKEN_DEBUGGER, new DebuggerService(scheme, this.params));
    scheme.extraView.registerSchemeLayer(BreakpointsLayer, 90);
  }

  initialize(scheme: Scheme) {
    const service = resolveService(TOKEN_DEBUGGER, scheme.container);
    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    cssClasses.addRootExtraCss(() => debuggerCss);

    this.disposers.push(
      scheme.commands.registerCommand(CMD_TOGGLE_BREAKPOINT, ({ nodeId }) => {
        service.toggleBreakpoint(nodeId);
        return true;
      }),
    );

    // Raw `namespace:key` text, like every other builder — the antd layer's
    // `translateContextMenuItems` is the single place menu texts go through `t()`.
    if (scheme.container.isRegistered(TOKEN_CONTEXT_MENU, true)) {
      resolveService(TOKEN_CONTEXT_MENU, scheme.container).registerBuilderForIcon(({ icon, builder }) => {
        if (!service.isBreakable(icon)) return;
        builder.addButtons({
          group: 'root',
          items: [
            {
              type: 'button',
              text: service.hasBreakpoint(icon.id) ? 'debugger:remove-breakpoint' : 'debugger:add-breakpoint',
              onClick: () => {
                scheme.commands.dispatchCommand(CMD_TOGGLE_BREAKPOINT, { nodeId: icon.id });
              },
            },
          ],
        });
      });
    }

    this.disposers.push(
      reaction(
        () => service.currentNodeId,
        (nodeId, previousNodeId) => {
          if (previousNodeId) {
            cssClasses.removeBlockClass(resolveVisibleIconId(scheme, previousNodeId), DEBUG_CURRENT_BLOCK_CLASS);
          }
          if (!nodeId) return;
          cssClasses.addBlockClass(resolveVisibleIconId(scheme, nodeId), DEBUG_CURRENT_BLOCK_CLASS);
          scrollToNode(scheme, nodeId);
        },
        { fireImmediately: true },
      ),
    );
  }

  dispose() {
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
  }
}
