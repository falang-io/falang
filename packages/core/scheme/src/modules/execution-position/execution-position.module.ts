import { resolveService } from '@falang/di';
import { reaction, type IReactionDisposer } from 'mobx';
import { TOKEN_CSS_CLASSES } from '../../di-tokens.js';
import type { Scheme } from '../../scheme/scheme.js';
import type { IModule } from '../../utils/i-module.js';
import { resolveVisibleIconId } from '../../utils/resolve-visible-icon-id.js';
import { scrollToNode } from '../../utils/scroll-to-node.js';

/** Where a program currently is, as a diagram location — the node ids are the scheme's own, `documentId` is the `Scheme.id` it belongs to. */
export interface IExecutionLocation {
  readonly documentId: string;
  readonly nodeId: string;
}

/** What `ExecutionPositionModule` follows. Must be MobX-observable (the module reacts to `location` changing); one source is typically shared by every scheme of a project, since a run can move between documents. */
export interface IExecutionPositionSource {
  readonly location: IExecutionLocation | null;
}

export interface IExecutionPositionModuleOptions {
  /** Pan the canvas to the current node whenever it changes (via `scrollToNode`, selection untouched). Default `true`. */
  readonly follow?: boolean;
}

/** Block class this module toggles on the current node — style it from a host theme if the default below doesn't fit. */
export const EXECUTION_CURRENT_CLASS = 'execution-current';

const EXECUTION_CURRENT_COLOR = '#f9e2af';

const executionPositionCss = `
  div.block-body.${EXECUTION_CURRENT_CLASS} {
    border-color: ${EXECUTION_CURRENT_COLOR};
    border-width: 2px;
    box-shadow: 0 0 0 3px ${EXECUTION_CURRENT_COLOR}59;
  }
  svg .block-body.${EXECUTION_CURRENT_CLASS} {
    stroke: ${EXECUTION_CURRENT_COLOR};
    stroke-width: 3;
  }
`;

/**
 * Highlights "where the program is right now" on the canvas: whenever `source.location` points into
 * this scheme, the node gets the `execution-current` block class (and the view pans to it); any
 * other location clears it. Product-agnostic — the source can be a live Temporal execution, a
 * debugger pause, a replayed history — and per-scheme like every `IModule`, while the location it
 * follows lives above the scheme (a run crosses documents through `call-function`). See
 * ADR 0022 (private) (first use) and ADR 0021 (private) (the debugger that builds on it).
 */
export class ExecutionPositionModule implements IModule {
  private readonly source: IExecutionPositionSource;
  private readonly follow: boolean;
  private disposer: IReactionDisposer | null = null;

  constructor(source: IExecutionPositionSource, options: IExecutionPositionModuleOptions = {}) {
    this.source = source;
    this.follow = options.follow ?? true;
  }

  initialize(scheme: Scheme): void {
    const cssClasses = resolveService(TOKEN_CSS_CLASSES, scheme.container);
    cssClasses.addRootExtraCss(() => executionPositionCss);
    this.disposer = reaction(
      () => this.source.location,
      (location) => {
        cssClasses.removeClassFromAllBlocks(EXECUTION_CURRENT_CLASS);
        if (!location || location.documentId !== scheme.id) return;
        cssClasses.addBlockClass(resolveVisibleIconId(scheme, location.nodeId), EXECUTION_CURRENT_CLASS);
        if (this.follow) scrollToNode(scheme, location.nodeId);
      },
      { fireImmediately: true },
    );
  }

  dispose(): void {
    this.disposer?.();
    this.disposer = null;
  }
}
