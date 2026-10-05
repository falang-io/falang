import { createContext, createElement, useContext, type FC, type ReactNode } from 'react';
import type { IEventTrackerHandler } from '../analytics/event-tracker.js';
import type { IApiUser } from '../api-client.js';

/** An extra top-level navigation entry, shown in the project-list header after the built-in ones. */
export interface IClientExtensionNavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Ascending; items without an order go last (ties keep declaration order). */
  order?: number;
}

/** A page opened by the nav item with the same `key` (navigation view `ext:<key>`). It replaces the whole screen; use `navigationStore.goToProjectList()` to return. */
export interface IClientExtensionView {
  key: string;
  render: () => ReactNode;
}

/** What `IClientExtensions.renderAgentPanelHeader` is rendered with. */
export interface IAgentPanelHeaderContext {
  readonly projectId: string;
  /**
   * Finished agent runs of this project so far (the chat's and every magic node's) — changes after each one, so a
   * header that shows something a turn changes (e.g. a balance) refetches when it changes.
   */
  readonly turnsFinished: number;
}

/**
 * The one explicit extension contract of the community client: a separate entry (e.g. the hosted cloud edition)
 * passes these slots to `renderWorkflowApp` instead of forking the client. Every slot is optional; `{}` changes nothing.
 */
export interface IClientExtensions {
  navItems?: IClientExtensionNavItem[];
  views?: IClientExtensionView[];
  /** Shown in the project-list header next to the built-in controls. */
  renderPlanBadge?: (user: IApiUser) => ReactNode;
  /** Analytics handler; `App` installs it into the `eventTracker` singleton. Absent = nothing is tracked anywhere. */
  eventTracker?: IEventTrackerHandler;
  /**
   * Called with the original thrown value of a failed agent turn (cloud: `AgentQuotaError` for HTTP 402 -> "buy
   * credits"); return `null` to fall back to the default error text. Passed as `renderError` to `AgentChatPanel` by
   * `ProjectRightSidebar`; a returned node replaces the plain error text.
   */
  renderAgentQuotaNotice?: (error: unknown) => ReactNode | null;
  /** Rendered above the agent chat panel while it is open (cloud: the agent balance). */
  renderAgentPanelHeader?: (ctx: IAgentPanelHeaderContext) => ReactNode;
}

const EMPTY_EXTENSIONS: IClientExtensions = {};

const ClientExtensionsContext = createContext<IClientExtensions>(EMPTY_EXTENSIONS);

export const ClientExtensionsProvider: FC<{ extensions?: IClientExtensions; children?: ReactNode }> = ({
  extensions,
  children,
}) => createElement(ClientExtensionsContext.Provider, { value: extensions ?? EMPTY_EXTENSIONS }, children);

export const useClientExtensions = (): IClientExtensions => useContext(ClientExtensionsContext);

export const EXTENSION_VIEW_PREFIX = 'ext:';

export const toExtensionViewName = (key: string): `ext:${string}` => `${EXTENSION_VIEW_PREFIX}${key}`;

export const sortExtensionNavItems = (items?: IClientExtensionNavItem[]): IClientExtensionNavItem[] =>
  (items ?? [])
    .map((item, index) => ({ item, index }))
    .toSorted((a, b) => (a.item.order ?? Infinity) - (b.item.order ?? Infinity) || a.index - b.index)
    .map(({ item }) => item);

/** The extension view addressed by a navigation view name (`ext:<key>`), if any. */
export const findExtensionView = (
  extensions: IClientExtensions,
  viewName: string,
): IClientExtensionView | undefined => {
  if (!viewName.startsWith(EXTENSION_VIEW_PREFIX)) return;
  const key = viewName.slice(EXTENSION_VIEW_PREFIX.length);
  return extensions.views?.find((view) => view.key === key);
};
