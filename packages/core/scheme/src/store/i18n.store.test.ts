import { describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, I18NStore } from './i18n.store.js';

const loaderFor = (resources: Record<string, Record<string, unknown>>) => () => Promise.resolve({ default: resources });

describe('I18NStore', () => {
  it('translates via a dynamically-loaded bundle for the current language', async () => {
    const store = new I18NStore();
    await store.register('mod', {
      en: loaderFor({ icon: { break: 'Break' } }),
    });

    expect(store.t('icon:break')).toBe('Break');
  });

  it('falls back to the fallback language when the active one has no bundle loaded yet', async () => {
    const store = new I18NStore();
    await store.setLanguage('ru');
    await store.register('mod', {
      en: loaderFor({ icon: { break: 'Break' } }),
    });

    expect(store.language).toBe('ru');
    expect(store.t('icon:break')).toBe('Break');
  });

  it('reloads every registered module when the language changes', async () => {
    const store = new I18NStore();
    await store.register('mod', {
      en: loaderFor({ icon: { break: 'Break' } }),
      ru: loaderFor({ icon: { break: 'Прервать' } }),
    });
    expect(store.t('icon:break')).toBe('Break');

    await store.setLanguage('ru');

    expect(store.language).toBe('ru');
    expect(store.t('icon:break')).toBe('Прервать');
  });

  it('starts on DEFAULT_LANGUAGE and returns the raw key before any bundle loads', () => {
    const store = new I18NStore();
    expect(store.language).toBe(DEFAULT_LANGUAGE);
    expect(store.t('icon:break')).toBe('icon:break');
  });

  it('whenIdle resolves once a fire-and-forget register() call has settled', async () => {
    const store = new I18NStore();
    // Not awaited on purpose — this is the fire-and-forget shape `IModule.register(scheme)` uses.
    store.register('mod', { en: loaderFor({ icon: { break: 'Break' } }) });

    await store.whenIdle();

    expect(store.t('icon:break')).toBe('Break');
  });
});
