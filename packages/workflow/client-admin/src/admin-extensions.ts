import { createContext, createElement, useContext, type FC, type ReactNode } from 'react';
import type { IAdminUser } from './admin-api.js';

/** An extra admin page: a menu entry after the built-in ones and the content shown when it is selected. */
export interface IAdminExtensionPage {
  key: string;
  label: string;
  icon?: ReactNode;
  render: () => ReactNode;
}

/**
 * The admin app's extension contract, the counterpart of the main client's `IClientExtensions`: a separate entry (e.g.
 * the hosted cloud edition) passes these slots to `AdminApp` instead of forking it. Every slot is optional; `{}`
 * changes nothing.
 */
export interface IAdminExtensions {
  pages?: IAdminExtensionPage[];
  /** Rendered below the built-in fields of the Users page's "Details" modal (cloud: the agent balance). */
  renderUserDetails?: (user: IAdminUser) => ReactNode;
}

const EMPTY_ADMIN_EXTENSIONS: IAdminExtensions = {};

const AdminExtensionsContext = createContext<IAdminExtensions>(EMPTY_ADMIN_EXTENSIONS);

export const AdminExtensionsProvider: FC<{ extensions?: IAdminExtensions; children?: ReactNode }> = ({
  extensions,
  children,
}) => createElement(AdminExtensionsContext.Provider, { value: extensions ?? EMPTY_ADMIN_EXTENSIONS }, children);

export const useAdminExtensions = (): IAdminExtensions => useContext(AdminExtensionsContext);

const EXTENSION_PAGE_PREFIX = 'ext:';

/** The navigation key of an extension page — prefixed so it can never collide with a built-in page. */
export const toAdminExtensionPage = (key: string): TAdminExtensionPage => `${EXTENSION_PAGE_PREFIX}${key}`;

export type TAdminExtensionPage = `ext:${string}`;

/** The extension page a navigation key addresses, if any. */
export const findAdminExtensionPage = (extensions: IAdminExtensions, page: string): IAdminExtensionPage | undefined => {
  if (!page.startsWith(EXTENSION_PAGE_PREFIX)) return;
  const key = page.slice(EXTENSION_PAGE_PREFIX.length);
  return extensions.pages?.find((candidate) => candidate.key === key);
};
