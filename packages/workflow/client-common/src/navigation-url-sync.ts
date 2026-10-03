import { reaction } from 'mobx';
import type { NavigationStore } from './navigation-store.js';
import { formatAppHash, isSameProjectRoute, parseAppHash } from './navigation-url.js';

interface IUrlWindow {
  location: { hash: string };
  history: Pick<History, 'pushState' | 'replaceState'>;
  addEventListener(type: 'popstate' | 'hashchange', listener: () => void): void;
  removeEventListener(type: 'popstate' | 'hashchange', listener: () => void): void;
}

/**
 * Two-way binding between `NavigationStore` and `location.hash` (no server configuration needed):
 * the current hash is applied to the store right away, store changes are written back (a new history
 * entry per screen/project change, an in-place replace for tab switches inside one project so Back
 * leaves the project instead of walking every tab), and Back/Forward re-apply the hash. A hash this
 * router doesn't own (`#/admin…`, anchors) is left alone. Returns the unbind function.
 */
export const bindNavigationToUrl = (
  store: NavigationStore,
  win: IUrlWindow = globalThis as unknown as IUrlWindow,
): (() => void) => {
  let applying = false;
  const applyHash = () => {
    const route = parseAppHash(win.location.hash);
    if (!route) return;
    applying = true;
    try {
      store.applyRoute(route);
    } finally {
      applying = false;
    }
  };
  applyHash();

  const stopReaction = reaction(
    () => formatAppHash(store.route),
    (hash, previousHash) => {
      if (applying || win.location.hash === hash) return;
      const replace = isSameProjectRoute(parseAppHash(previousHash), parseAppHash(hash));
      if (replace) win.history.replaceState(null, '', hash);
      else win.history.pushState(null, '', hash);
    },
  );

  win.addEventListener('popstate', applyHash);
  win.addEventListener('hashchange', applyHash);
  return () => {
    stopReaction();
    win.removeEventListener('popstate', applyHash);
    win.removeEventListener('hashchange', applyHash);
  };
};
