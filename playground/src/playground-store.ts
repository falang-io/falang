import type { DebugSessionStore, Scheme } from '@falang/scheme';
import { action, makeObservable, observable, reaction } from 'mobx';
import {
  createDebugSession,
  createPlaygroundScheme,
  PLAYGROUND_ROOT_KINDS,
  type TPlaygroundRootKind,
} from './playground-scheme.tsx';
import { getPlaygroundTheme, PLAYGROUND_THEMES, type IPlaygroundTheme, type TPlaygroundThemeId } from './themes.ts';

const STORAGE_KEY = 'falang:playground';

interface IPersistedSettings {
  readonly rootKind: TPlaygroundRootKind;
  readonly themeId: TPlaygroundThemeId;
  readonly debugPanelOpen: boolean;
}

const DEFAULT_SETTINGS: IPersistedSettings = { rootKind: 'contour', themeId: 'default', debugPanelOpen: true };

const readSettings = (): IPersistedSettings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<IPersistedSettings>;
    return {
      rootKind: PLAYGROUND_ROOT_KINDS.includes(parsed.rootKind as TPlaygroundRootKind)
        ? (parsed.rootKind as TPlaygroundRootKind)
        : DEFAULT_SETTINGS.rootKind,
      themeId: PLAYGROUND_THEMES.some((theme) => theme.id === parsed.themeId)
        ? (parsed.themeId as TPlaygroundThemeId)
        : DEFAULT_SETTINGS.themeId,
      debugPanelOpen:
        typeof parsed.debugPanelOpen === 'boolean' ? parsed.debugPanelOpen : DEFAULT_SETTINGS.debugPanelOpen,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const writeSettings = (settings: IPersistedSettings): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private window, blocked site data) — settings just don't persist.
  }
};

export class PlaygroundStore {
  rootKind: TPlaygroundRootKind;
  themeId: TPlaygroundThemeId;
  debugPanelOpen: boolean;
  jsonOpen = false;
  scheme: Scheme;

  readonly session: DebugSessionStore;

  constructor() {
    const settings = readSettings();
    this.rootKind = settings.rootKind;
    this.themeId = settings.themeId;
    this.debugPanelOpen = settings.debugPanelOpen;
    this.session = createDebugSession(() => this.scheme);
    this.scheme = this.buildScheme();
    makeObservable(this, {
      rootKind: observable,
      themeId: observable,
      debugPanelOpen: observable,
      jsonOpen: observable,
      scheme: observable.ref,
      setRootKind: action,
      rebuild: action,
      setTheme: action,
      setDebugPanelOpen: action,
      setJsonOpen: action,
    });

    reaction(
      () => ({ rootKind: this.rootKind, themeId: this.themeId, debugPanelOpen: this.debugPanelOpen }),
      writeSettings,
    );
  }

  get theme(): IPlaygroundTheme {
    return getPlaygroundTheme(this.themeId);
  }

  setRootKind(kind: TPlaygroundRootKind): void {
    if (kind === this.rootKind) return;
    this.rootKind = kind;
    this.rebuild();
  }

  /** A fresh document of the current kind — handy after the agent demo or a messy experiment. */
  rebuild(): void {
    // Never rejects: an adapter failure lands in the session status.
    this.session.stop();
    const previous = this.scheme;
    this.scheme = this.buildScheme();
    // Let React unmount the old `SchemeComponent` before its container goes away.
    setTimeout(() => previous.dispose(), 0);
  }

  setTheme(themeId: TPlaygroundThemeId): void {
    this.themeId = themeId;
    this.scheme.theme.setTheme(this.theme.scheme);
  }

  setDebugPanelOpen(open: boolean): void {
    this.debugPanelOpen = open;
  }

  setJsonOpen(open: boolean): void {
    this.jsonOpen = open;
  }

  private buildScheme(): Scheme {
    const scheme = createPlaygroundScheme(this.rootKind, this.session);
    scheme.theme.setTheme(getPlaygroundTheme(this.themeId).scheme);
    return scheme;
  }
}

export const playgroundStore = new PlaygroundStore();

// Handy for poking at the live instances from the browser console / a Playwright script.
Object.assign(globalThis, {
  __playground: {
    store: playgroundStore,
    get scheme() {
      return playgroundStore.scheme;
    },
    session: playgroundStore.session,
  },
});
