import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Select } from 'antd';
import { authStore } from '../auth-store.js';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

/** The interface language (persisted on the user, `authStore.setLanguage`); shown on the Settings page. */
export const LanguageSwitcher: React.FC<{ width?: number }> = observer(({ width = 100 }) => {
  const language = authStore.currentUser?.language;
  if (!language) return null;
  return (
    <Select
      size={width > 100 ? 'middle' : 'small'}
      value={language}
      style={{ width }}
      data-testid="language-select"
      options={LANGUAGE_OPTIONS}
      onChange={(value: string) => {
        authStore.setLanguage(value).catch((error: unknown) => {
          // oxlint-disable-next-line no-console
          console.error('Failed to change language', error);
        });
      }}
    />
  );
});
