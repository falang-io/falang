import type React from 'react';
import { useEffect, useState } from 'react';
import { Alert, Modal, Spin, Switch, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { workflowApi } from '../api-client.js';

interface Props {
  readonly projectId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}

/** "Run journal" settings (ADR 0059 (private) §6): the per-project "store texts" switch, owner only. */
export const RunJournalSettingsModal: React.FC<Props> = ({ projectId, open, onClose }) => {
  const t = getGlobalI18n().t;
  const [storeTexts, setStoreTexts] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setStoreTexts(null);
    setErrorMessage(null);
    workflowApi
      .getJournalSettings(projectId)
      .then((settings) => setStoreTexts(settings.storeTexts))
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:run-journal-settings.failed-to-load')),
      );
  }, [open, projectId, t]);

  const change = (value: boolean): void => {
    setSaving(true);
    setErrorMessage(null);
    workflowApi
      .setJournalSettings(projectId, { storeTexts: value })
      .then((settings) => setStoreTexts(settings.storeTexts))
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:run-journal-settings.failed-to-save')),
      )
      .finally(() => setSaving(false));
  };

  return (
    <Modal
      title={t('client:run-journal-settings.title')}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      data-testid="run-journal-settings-modal"
    >
      {errorMessage && <Alert type="error" showIcon message={errorMessage} style={{ marginBottom: 12 }} />}
      {storeTexts === null && !errorMessage && <Spin />}
      {storeTexts !== null && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Switch checked={storeTexts} loading={saving} onChange={change} data-testid="run-journal-store-texts" />
          <span>{t('client:run-journal-settings.store-texts')}</span>
        </div>
      )}
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        {t('client:run-journal-settings.hint')}
      </Typography.Paragraph>
    </Modal>
  );
};
