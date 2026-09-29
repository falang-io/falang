import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Select } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { reportError } from '../../../shared/report-error.js';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

export const LanguageSwitcher: React.FC = observer(() => {
  const i18n = getGlobalI18n();
  return (
    <Select
      size="small"
      value={i18n.language}
      style={{ width: 100 }}
      options={LANGUAGE_OPTIONS}
      onChange={(language: string) => {
        i18n.setLanguage(language).catch((error: unknown) => reportError('Failed to change language', error));
        globalThis.falang.settings
          .setLanguage(language)
          .catch((error: unknown) => reportError('Failed to persist language', error));
      }}
    />
  );
});
