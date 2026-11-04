import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Input, Modal, Progress, Radio, Space, Switch, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { arduinoCliSettingsModalStore as modal } from '../arduino-cli-settings-store.js';
import { arduinoCliStatusStore as cli } from '../arduino-cli-status-store.js';
import { describeDownloadProgress } from '../arduino-cli-ui-model.js';
import { reportError } from '../../../shared/report-error.js';
import { runReporting } from '../run-reporting.js';
import type { IArduinoCliFullStatus } from '../../../shared/arduino-cli-ipc-types.js';

const PREFIX = 'desktop-app-arduino:arduino-cli';

const StatusLine: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const status = cli.status;
  if (status === null) return null;
  if (!status.available) {
    return (
      <Alert
        type="warning"
        showIcon
        data-testid="arduino-cli-status"
        message={t(`${PREFIX}.problem-${status.problem ?? 'not-found'}`)}
      />
    );
  }
  return (
    <Alert
      type="success"
      showIcon
      data-testid="arduino-cli-status"
      message={
        <span>
          arduino-cli {status.version ?? ''} ({t(`${PREFIX}.source-${status.source}`)})
          <br />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {status.path}
            {status.serialMonitorSupported ? '' : ` — ${t(`${PREFIX}.no-serial`)}`}
          </Typography.Text>
        </span>
      }
    />
  );
});

const downloadButtonLabel = (status: IArduinoCliFullStatus | null): string => {
  const t = getGlobalI18n().t;
  if (status?.updateAvailable && status.latestVersion)
    return t(`${PREFIX}.update-to`, { version: status.latestVersion });
  return status?.managedVersion ? t(`${PREFIX}.redownload`) : t(`${PREFIX}.download`);
};

const DownloadProgress: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const view = cli.progress ? describeDownloadProgress(cli.progress) : null;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Progress percent={view?.percent ?? 0} status="active" showInfo={view?.percent !== null} />
      <Typography.Text type="secondary">{view?.text ?? t(`${PREFIX}.downloading`)}</Typography.Text>
      <Button onClick={() => runReporting(cli.cancelInstall(), 'Cancel failed')}>{t(`${PREFIX}.cancel`)}</Button>
    </Space>
  );
});

const DownloadButtons: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const status = cli.status;
  const busyOther = cli.busy !== null;
  const installed = status?.managedVersion;
  return (
    <Space wrap>
      <Button
        disabled={busyOther}
        data-testid="arduino-cli-download"
        onClick={() => runReporting(cli.install(), 'Failed to download arduino-cli')}
        type={installed ? 'default' : 'primary'}
      >
        {downloadButtonLabel(status)}
      </Button>
      <Button
        disabled={busyOther || !installed}
        loading={cli.checking}
        onClick={() => runReporting(cli.checkUpdates(), 'Update check failed')}
      >
        {t(`${PREFIX}.check-updates`)}
      </Button>
      {status?.updateAvailable === false && installed && (
        <Typography.Text type="secondary">{t(`${PREFIX}.up-to-date`)}</Typography.Text>
      )}
    </Space>
  );
});

const DownloadedSection: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const installed = cli.status?.managedVersion;
  const versionText = installed
    ? t(`${PREFIX}.downloaded-version`, { version: installed })
    : t(`${PREFIX}.not-downloaded`);
  return (
    <div style={{ marginLeft: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Typography.Text data-testid="arduino-cli-managed-version">{versionText}</Typography.Text>
      {cli.installing ? <DownloadProgress /> : <DownloadButtons />}
      <Space>
        <Switch checked={modal.checkUpdates} onChange={(value) => modal.setCheckUpdates(value)} />
        <Typography.Text>{t(`${PREFIX}.check-automatically`)}</Typography.Text>
      </Space>
      {cli.installError && <Alert type="error" message={cli.installError} />}
    </div>
  );
});

const CustomPathRow: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  return (
    <Space.Compact style={{ marginLeft: 24, width: 'calc(100% - 24px)' }}>
      <Input
        value={modal.customPath}
        placeholder={t(`${PREFIX}.path-placeholder`)}
        onChange={(event) => modal.setCustomPath(event.target.value)}
        data-testid="arduino-cli-custom-path"
      />
      <Button onClick={() => runReporting(modal.browse(), 'Failed to browse')}>{t(`${PREFIX}.browse`)}</Button>
    </Space.Compact>
  );
});

/** Settings → arduino-cli…: where the CLI comes from (system / a file / downloaded), ADR 0074 (private) §6. */
export const ArduinoCliSettingsModal: React.FC = observer(() => {
  const t = getGlobalI18n().t;

  useEffect(() => {
    if (!modal.isOpen) return;
    return cli.start();
  }, [modal.isOpen]);

  const handleOk = (): void => {
    modal
      .save()
      .then((ok) => {
        if (ok) modal.close();
      })
      .catch((error: unknown) => reportError('Failed to save arduino-cli settings', error));
  };

  return (
    <Modal
      title={t(`${PREFIX}.title`)}
      open={modal.isOpen}
      onOk={handleOk}
      okButtonProps={{ disabled: cli.busy !== null && modal.source === 'managed' && !cli.installing }}
      confirmLoading={modal.saving}
      onCancel={() => modal.close()}
      width={560}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="arduino-cli-settings">
        <StatusLine />
        <Radio.Group value={modal.source} onChange={(event) => modal.setSource(event.target.value)}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Radio value="system">{t(`${PREFIX}.source-system-option`)}</Radio>
            <Radio value="custom">{t(`${PREFIX}.source-custom-option`)}</Radio>
            {modal.source === 'custom' && <CustomPathRow />}
            <Radio value="managed">{t(`${PREFIX}.source-managed-option`)}</Radio>
            {modal.source === 'managed' && <DownloadedSection />}
          </Space>
        </Radio.Group>
        {modal.error && <Alert type="error" message={modal.error} data-testid="arduino-cli-settings-error" />}
      </div>
    </Modal>
  );
});
