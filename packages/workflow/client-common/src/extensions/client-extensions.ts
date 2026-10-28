import { createContext, createElement, useContext, type FC, type ReactNode } from 'react';
import type { IEventTrackerHandler } from '../analytics/event-tracker.js';
import type { IApiUser } from '../api-client.js';

/** An extra top-level navigation entry, shown in the app header after the built-in ones (just before the user menu). */
export interface IClientExtensionNavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /**
   * The item's content instead of `icon` + `label` (cloud: a wallet icon and the current balance). Rendered on every
   * header render — return an `observer` component to keep it live.
   */
  render?: () => ReactNode;
  /** Ascending; items without an order go last (ties keep declaration order). */
  order?: number;
}

/** A page opened by the nav item with the same `key` (navigation view `ext:<key>`), shown under the app header. */
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

/** What `IClientExtensions.renderRuntimeCost` is rendered with. */
export interface IRuntimeCostContext {
  readonly projectId: string;
  readonly env: 'dev' | 'prod';
}

/** What `IClientExtensions.renderSuspendedAction` is rendered with. */
export interface ISuspendedActionContext {
  readonly projectId: string;
  readonly reason: 'balance' | 'admin';
}

/**
 * The one explicit extension contract of the community client: a separate entry (e.g. the hosted cloud edition)
 * passes these slots to `renderWorkflowApp` instead of forking the client. Every slot is optional; `{}` changes nothing.
 */
export interface IClientExtensions {
  navItems?: IClientExtensionNavItem[];
  views?: IClientExtensionView[];
  /** Shown in the app header just before the user menu. */
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
  /** Rendered under each environment section of the "Project servers" modal (cloud: the hourly price and today's uptime). ADR 0067 (private). */
  renderRuntimeCost?: (ctx: IRuntimeCostContext) => ReactNode;
  /** Rendered next to the toolbar's "Servers off" pill (cloud: a "Top up" link for `reason: 'balance'`). ADR 0067 (private). */
  renderSuspendedAction?: (ctx: ISuspendedActionContext) => ReactNode;
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
