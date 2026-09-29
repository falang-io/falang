import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { Form, Input, InputNumber, Modal, Radio } from 'antd';
// Deliberately not `@falang/desktop-project-fs`'s main barrel: that package's `index.ts` also
// re-exports fs/isomorphic-git-heavy modules (`project.ts`, `watch-project.ts`, `git-version-store.ts`,
// ...), and a renderer-side ESM import executes a module's whole dependency graph regardless of which
// named export is actually used — pulling in `node:fs` crashes the renderer at startup with "Module
// 'node:fs' has been externalized for browser compatibility". `git-version-store-types.ts` itself has
// no Node dependencies, so importing it directly keeps this modal out of that barrel entirely (same
// fix as `app-sketch`'s copy of this file, see ADR 0025 (private)).
import {
  DEFAULT_AUTO_VERSION_GAP_HOURS,
  DEFAULT_GIT_VERSIONING_OPTIONS,
  type IGitVersioningOptions,
} from '@falang/desktop-project-fs/src/versioning/git-version-store-types.js';
import { getGlobalI18n } from '@falang/scheme';
import { versioningSettingsModalStore } from '../versioning-settings-modal-store.js';
import { reportError } from '../../../shared/report-error.js';

interface IVersioningSettingsFormValues {
  repoMode: 'private' | 'enclosing';
  authorName: string;
  authorEmail: string;
  autoVersionGapHours: number;
}

const DEFAULT_VALUES: IVersioningSettingsFormValues = {
  repoMode: DEFAULT_GIT_VERSIONING_OPTIONS.repoMode,
  authorName: DEFAULT_GIT_VERSIONING_OPTIONS.author.name,
  authorEmail: DEFAULT_GIT_VERSIONING_OPTIONS.author.email,
  autoVersionGapHours: DEFAULT_AUTO_VERSION_GAP_HOURS,
};

/**
 * App-wide git versioning settings (repo mode, commit author) — same "app-wide setting in
 * `main`'s `settings.json`, edited from a Settings menu item" shape as `AgentSettingsModal`, see
 * ADR 0025 (private) ("Decisions (2026-09-17)" #3) and 0026's own precedent.
 */
export const VersioningSettingsModal: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [form] = Form.useForm<IVersioningSettingsFormValues>();
  const [isSaving, setSaving] = useState(false);

  useEffect(() => {
    if (!versioningSettingsModalStore.isOpen) return;
    globalThis.falang.settings
      .getVersioningSettings()
      .then((settings) =>
        form.setFieldsValue({
          repoMode: settings.repoMode,
          authorName: settings.author.name,
          authorEmail: settings.author.email,
          autoVersionGapHours: settings.autoVersionGapHours ?? DEFAULT_AUTO_VERSION_GAP_HOURS,
        }),
      )
      .catch((error: unknown) => reportError('Failed to load versioning settings', error));
  }, [versioningSettingsModalStore.isOpen, form]);

  const handleOk = (): void => {
    form
      .validateFields()
      .then(async (values) => {
        setSaving(true);
        const settings: IGitVersioningOptions = {
          repoMode: values.repoMode,
          author: { name: values.authorName, email: values.authorEmail },
          autoVersionGapHours: values.autoVersionGapHours,
        };
        await globalThis.falang.settings.setVersioningSettings(settings);
        setSaving(false);
        versioningSettingsModalStore.close();
      })
      .catch((error: unknown) => {
        setSaving(false);
        if (error instanceof Error) reportError('Failed to save versioning settings', error);
      });
  };

  return (
    <Modal
      title={t('desktop-app-arduino:versioning-settings.title')}
      open={versioningSettingsModalStore.isOpen}
      onOk={handleOk}
      confirmLoading={isSaving}
      onCancel={() => versioningSettingsModalStore.close()}
    >
      <Form form={form} layout="vertical" initialValues={DEFAULT_VALUES}>
        <Form.Item name="repoMode" label={t('desktop-app-arduino:versioning-settings.repo-mode-label')}>
          <Radio.Group style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <Radio value="private">
              {t('desktop-app-arduino:versioning-settings.repo-mode-private')}
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {t('desktop-app-arduino:versioning-settings.repo-mode-private-hint')}
              </div>
            </Radio>
            <Radio value="enclosing">
              {t('desktop-app-arduino:versioning-settings.repo-mode-enclosing')}
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {t('desktop-app-arduino:versioning-settings.repo-mode-enclosing-hint')}
              </div>
            </Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          name="authorName"
          label={t('desktop-app-arduino:versioning-settings.author-name-label')}
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="authorEmail"
          label={t('desktop-app-arduino:versioning-settings.author-email-label')}
          rules={[{ required: true, message: 'Required' }]}
        >
          <Input />
        </Form.Item>
        <Form.Item
          name="autoVersionGapHours"
          label={t('desktop-app-arduino:versioning-settings.auto-version-gap-hours-label')}
          extra={t('desktop-app-arduino:versioning-settings.auto-version-gap-hours-hint')}
          rules={[{ required: true, type: 'number', min: 1 }]}
        >
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
});
