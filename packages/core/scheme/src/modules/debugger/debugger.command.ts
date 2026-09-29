import { createCommand } from '../../scheme/scheme-commands.js';

export interface IToggleBreakpointCommandParams {
  nodeId: string;
}

/** Toggles a breakpoint on one of this scheme's statement nodes — dispatched by the context-menu entry, the breakpoint dot itself, or a host's keyboard shortcut (F9). Ignored for non-breakable nodes. */
export const CMD_TOGGLE_BREAKPOINT = createCommand<IToggleBreakpointCommandParams>('TOGGLE_BREAKPOINT');
