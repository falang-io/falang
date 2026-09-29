import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Form, Modal, Radio } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { languageSettingsModalStore } from '../language-settings-modal-store.js';
import { reportError } from '../../../shared/report-error.js';

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

interface ILanguageSettingsFormValues {
  language: string;
}

/**
 * App-wide UI language — same "Settings menu item opens a modal, persisted in `main`'s
 * `settings.json`" shape as `AgentSettingsModal`/`VersioningSettingsModal`. Saving here also
 * applies the change immediately via `getGlobalI18n().setLanguage`.
 */
export const LanguageSettingsModal: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [form] = Form.useForm<ILanguageSettingsFormValues>();
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (!languageSettingsModalStore.isOpen) return;
    globalThis.falang.settings
      .getLanguage()
      .then((language) => form.setFieldsValue({ language: language ?? getGlobalI18n().language }))
      .catch((error: unknown) => reportError('Failed to load language settings', error));
  }, [languageSettingsModalStore.isOpen, form]);

  const handleOk = (): void => {
    form
      .validateFields()
      .then(async (values) => {
        setSaving(true);
        await getGlobalI18n().setLanguage(values.language);
        await globalThis.falang.settings.setLanguage(values.language);
        setSaving(false);
        languageSettingsModalStore.close();
      })
      .catch((error: unknown) => {
        setSaving(false);
        if (error instanceof Error) reportError('Failed to save language settings', error);
      });
  };

  return (
    <Modal
      title={t('desktop-app-arduino:language-settings.title')}
      open={languageSettingsModalStore.isOpen}
      onOk={handleOk}
      confirmLoading={isSaving}
      onCancel={() => languageSettingsModalStore.close()}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="language" label={t('desktop-app-arduino:language-settings.label')}>
          <Radio.Group options={LANGUAGE_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
});
