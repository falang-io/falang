import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Button, Progress, Space, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { arduinoCliStatusStore as cli } from '../arduino-cli-status-store.js';
import { arduinoCliSettingsModalStore } from '../arduino-cli-settings-store.js';
import { arduinoCoresStore as cores } from '../arduino-cores-store.js';
import { cliAlertKind, describeDownloadProgress, shouldOfferCliUpdate } from '../arduino-cli-ui-model.js';
import { runReporting } from '../run-reporting.js';

const PREFIX = 'desktop-app-arduino:arduino-cli';
const CORES_PREFIX = 'desktop-app-arduino:arduino-cores';

const CliProgress: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const view = cli.progress ? describeDownloadProgress(cli.progress) : null;
  return (
    <>
      <Progress percent={view?.percent ?? 0} status="active" showInfo={view?.percent !== null} />
      <Typography.Text type="secondary">{view?.text ?? t(`${PREFIX}.downloading`)}</Typography.Text>
      <Button onClick={() => runReporting(cli.cancelInstall(), 'Cancel failed')}>{t(`${PREFIX}.cancel`)}</Button>
    </>
  );
});

/** The build panel's "arduino-cli is missing / outdated" notices (ADR 0074 (private) §6). */
export const ArduinoCliNotices: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const kind = cliAlertKind(cli.status);
  const busyOther = cli.busy !== null && !cli.installing;
  const download = (): void => runReporting(cli.install(), 'Failed to download arduino-cli');
  return (
    <>
      {kind !== 'none' && (
        <Alert
          type="warning"
          showIcon
          data-testid="arduino-cli-missing"
          message={t(`${PREFIX}.alert-${kind}`)}
          description={
            <Space direction="vertical" style={{ width: '100%' }}>
              <span>{t(`${PREFIX}.alert-${kind}-hint`)}</span>
              {cli.installing ? (
                <CliProgress />
              ) : (
                <Space>
                  <Button type="primary" disabled={busyOther} onClick={download} data-testid="arduino-cli-download">
                    {t(`${PREFIX}.download-cli`)}
                  </Button>
                  <Button
                    onClick={() => runReporting(arduinoCliSettingsModalStore.open('custom'), 'Failed to open settings')}
                  >
                    {t(`${PREFIX}.choose-path`)}
                  </Button>
                </Space>
              )}
              {cli.installError && <Alert type="error" message={cli.installError} />}
            </Space>
          }
        />
      )}
      {shouldOfferCliUpdate(cli.status) && !cli.installing && (
        <Alert
          type="info"
          showIcon
          data-testid="arduino-cli-update"
          message={t(`${PREFIX}.update-available`, { version: cli.status?.latestVersion })}
          action={
            <Button size="small" disabled={busyOther} onClick={download}>
              {t(`${PREFIX}.update`)}
            </Button>
          }
        />
      )}
      {cli.status?.available && cli.status.path && (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          arduino-cli: {cli.status.path}
        </Typography.Text>
      )}
    </>
  );
});

/** The board-core notice: "core X is not installed" + Install, the streamed install output, Cancel. */
export const ArduinoCoreNotice: React.FC<{ fqbn: string }> = observer(({ fqbn }) => {
  const t = getGlobalI18n().t;
  const status = cores.status;
  if (!cores.missing && !cores.installing && cores.error === null) return null;
  const busyOther = cli.busy !== null && !cores.installing;
  return (
    <Alert
      type={cores.missing || cores.installing ? 'warning' : 'error'}
      showIcon
      data-testid="arduino-core-missing"
      message={t(`${CORES_PREFIX}.missing`, { platform: status?.platformId, board: status?.boardLabel })}
      description={
        <Space direction="vertical" style={{ width: '100%' }}>
          {cores.installing ? (
            <Button onClick={() => runReporting(cores.cancelInstall(), 'Cancel failed')}>
              {t(`${CORES_PREFIX}.cancel`)}
            </Button>
          ) : (
            <Button
              type="primary"
              disabled={busyOther}
              data-testid="arduino-core-install"
              onClick={() => runReporting(cores.install(fqbn), 'Failed to install the board core')}
            >
              {t(`${CORES_PREFIX}.install`)}
            </Button>
          )}
          {cores.output.length > 0 && (
            <pre
              data-testid="arduino-core-output"
              style={{ maxHeight: 160, overflow: 'auto', fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}
            >
              {cores.output.join('\n')}
            </pre>
          )}
          {cores.error && <Typography.Text type="danger">{cores.error}</Typography.Text>}
        </Space>
      }
    />
  );
});
