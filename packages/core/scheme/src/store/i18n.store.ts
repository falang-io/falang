import { action, makeObservable, observable, runInAction } from 'mobx';
import i18next, { type TFunction } from 'i18next';
import logger from '../utils/logger.js';

export type { TFunction } from 'i18next';

export type TLocaleResources = Record<string, Record<string, unknown>>;
export type TLocaleLoader = () => Promise<{ default: TLocaleResources }>;

export const DEFAULT_LANGUAGE = 'en';
const FALLBACK_LANGUAGE = 'en';

const identityT = ((key: string) => key) as TFunction;

// Only a starting guess for pre-login/pre-settings-load screens (e.g. the login page itself) —
// `AuthStore`/`packages/desktop/app-sketch`'s `settings.ts` still call `setLanguage()` with the real
// persisted value once it loads, which wins regardless of this guess. Gated on `window`, not
// `navigator` — Node 24+ ships a real (OS-locale-derived) `navigator.language`, which would make
// this environment-dependent under Vitest's default `node` test environment; `window` stays
// reliably absent there (and in Electron's main process), so tests keep seeing `DEFAULT_LANGUAGE`.
const getBrowserLanguage = (): string => ('window' in globalThis ? navigator.language.split('-')[0] : DEFAULT_LANGUAGE);

export class I18NStore {
  @observable.ref language: string = getBrowserLanguage();
  @observable.ref t: TFunction = identityT;

  private readonly i18n = i18next.createInstance();
  private readonly loaders = new Map<string, Partial<Record<string, TLocaleLoader>>>();
  private readonly loaded = new Set<string>();
  private readonly pending = new Set<Promise<unknown>>();
  private initPromise: Promise<unknown> | null = null;

  constructor() {
    makeObservable(this);
  }

  private ensureInit(): Promise<unknown> {
    if (!this.initPromise) {
      this.initPromise = this.i18n.init({
        lng: this.language,
        fallbackLng: FALLBACK_LANGUAGE,
        ns: [],
        defaultNS: false,
        resources: {},
        interpolation: { escapeValue: false },
      });
    }
    return this.initPromise;
  }

  private loadKey(moduleId: string, lang: string): string {
    return `${moduleId}:${lang}`;
  }

  private async fetchAndApply(loader: TLocaleLoader, lang: string): Promise<void> {
    await this.ensureInit();
    const module = await loader();
    runInAction(() => {
      for (const [namespace, resources] of Object.entries(module.default)) {
        this.i18n.addResourceBundle(lang, namespace, resources, true, true);
      }
      this.refreshT();
    });
  }

  private async loadModuleForLanguage(moduleId: string, lang: string): Promise<void> {
    const key = this.loadKey(moduleId, lang);
    if (this.loaded.has(key)) return;
    const loader = this.loaders.get(moduleId)?.[lang];
    if (!loader) return;
    this.loaded.add(key);
    const donePromise = this.fetchAndApply(loader, lang);
    this.pending.add(donePromise);
    try {
      await donePromise;
    } finally {
      this.pending.delete(donePromise);
    }
  }

  // For tests (and any caller) that need translated text to be settled before asserting/rendering
  // synchronously — e.g. after `schemeFactory()` wires up a module whose `register(scheme)` fires
  // `i18nStore.register(...)` fire-and-forget. Loops because awaiting the current batch can itself
  // enqueue more (e.g. a `setLanguage()` racing in) — nothing to parallelize across iterations,
  // since the next batch doesn't exist yet when a given pass starts.
  async whenIdle(): Promise<void> {
    while (this.pending.size > 0) {
      // oxlint-disable-next-line no-await-in-loop
      await Promise.all(this.pending);
    }
  }

  @action.bound private refreshT(): void {
    this.t = this.i18n.getFixedT(this.language);
  }

  // Returns a settle-promise for tests/callers that want to wait for the initial load; normal
  // call sites (module `register(scheme)` hooks) are fire-and-forget and ignore it, since `t`
  // is observable and reactive components re-render once the bundle lands.
  register(moduleId: string, newLoaders: Partial<Record<string, TLocaleLoader>>): Promise<unknown> {
    this.loaders.set(moduleId, newLoaders);
    const languagesToLoad = new Set([this.language, FALLBACK_LANGUAGE]);
    return Promise.all(
      [...languagesToLoad].map((lang) =>
        this.loadModuleForLanguage(moduleId, lang).catch((error: unknown) => {
          logger.error(`I18NStore: failed to load locale bundle for module "${moduleId}", language "${lang}"`, error);
        }),
      ),
    );
  }

  async setLanguage(lang: string): Promise<void> {
    await this.ensureInit();
    await Promise.all([...this.loaders.keys()].map((moduleId) => this.loadModuleForLanguage(moduleId, lang)));
    await this.i18n.changeLanguage(lang);
    runInAction(() => {
      this.language = lang;
      this.refreshT();
    });
  }
}
