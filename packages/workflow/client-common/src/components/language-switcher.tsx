import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Select } from 'antd';
import { authStore } from '../auth-store.js';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

export const LanguageSwitcher: React.FC = observer(() => {
  const language = authStore.currentUser?.language;
  if (!language) return null;
  return (
    <Select
      size="small"
      value={language}
      style={{ width: 100 }}
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
