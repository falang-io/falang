import { computed, makeObservable } from 'mobx';
import { checker } from '../../checker.js';
import type { Scheme } from '../../scheme/scheme.js';
import type { IconStore } from '../../store/icon.store.js';
import type { DebugSessionStore } from './debug-session.store.js';

export type TIsBreakable = (icon: IconStore) => boolean;

/**
 * Default breakability rule: the icon is a *statement* — a direct child of a skewer container
 * (function body, loop body, if/switch branch, thread). That is exactly the set both compilers wrap
 * in `icon-start`/`icon-end` markers and will emit trace points for (ADR 0021 §4); headers,
 * branches themselves and out-nodes never get a breakpoint.
 */
export const isStatementIcon: TIsBreakable = (icon) => (icon.parent ? checker.isWithSkewer(icon.parent) : false);

export interface IDebuggerServiceParams {
  readonly session: DebugSessionStore;
  /** The document this scheme renders — every breakpoint/location is keyed by it in the session. */
  readonly documentId: string;
  readonly isBreakable?: TIsBreakable;
}

/** Per-scheme view over the project-level `DebugSessionStore`: this document's breakpoints and, while paused here, the current node. */
export class DebuggerService {
  readonly session: DebugSessionStore;
  readonly documentId: string;
  private readonly scheme: Scheme;
  private readonly isBreakablePredicate: TIsBreakable;

  constructor(scheme: Scheme, params: IDebuggerServiceParams) {
    this.scheme = scheme;
    this.session = params.session;
    this.documentId = params.documentId;
    this.isBreakablePredicate = params.isBreakable ?? isStatementIcon;
    makeObservable(this);
  }

  isBreakable(icon: IconStore): boolean {
    return this.isBreakablePredicate(icon);
  }

  hasBreakpoint(nodeId: string): boolean {
    return this.session.hasBreakpoint({ documentId: this.documentId, nodeId });
  }

  /** Returns whether a breakpoint is now set; `false` (and no change) for an unknown or non-breakable node. */
  toggleBreakpoint(nodeId: string): boolean {
    const icon = this.scheme.icons.getIconSafe(nodeId);
    if (!icon || !this.isBreakable(icon)) return false;
    return this.session.toggleBreakpoint({ documentId: this.documentId, nodeId });
  }

  @computed get breakpointIds(): ReadonlySet<string> {
    return this.session.getBreakpointIds(this.documentId);
  }

  /** Icons carrying a breakpoint that currently exist in this scheme (a stale id, e.g. a deleted node, is skipped rather than thrown on). */
  @computed get breakpointIcons(): readonly IconStore[] {
    const icons: IconStore[] = [];
    for (const nodeId of this.breakpointIds) {
      const icon = this.scheme.icons.getIconSafe(nodeId);
      if (icon) icons.push(icon);
    }
    return icons;
  }

  /** The node the session is paused on, if it's in this document — `null` while running or paused elsewhere. */
  @computed get currentNodeId(): string | null {
    const location = this.session.pausedLocation;
    return location && location.documentId === this.documentId ? location.nodeId : null;
  }
}
