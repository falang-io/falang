import { describe, expect, it } from 'vitest';
import { MENU_LABELS, resolveMenuLanguage } from './menu-labels.js';

describe('menu labels', () => {
  it('has the same keys in both languages', () => {
    expect(Object.keys(MENU_LABELS.ru).toSorted()).toEqual(Object.keys(MENU_LABELS.en).toSorted());
  });

  it('prefers the saved language, then the OS locale', () => {
    expect(resolveMenuLanguage('en', 'ru-RU')).toBe('en');
    expect(resolveMenuLanguage(null, 'ru-RU')).toBe('ru');
    expect(resolveMenuLanguage(null, 'de')).toBe('en');
  });
});
