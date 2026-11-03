import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { action, makeObservable, observable, runInAction } from 'mobx';
import { getGlobalI18n } from '@falang/scheme';
import { ApiCodedError } from '@falang/workflow-client-common';
import { Alert, Button, Card, Form, Input, InputNumber, Popconfirm, Tag, Typography, message } from 'antd';
import { adminApi, type IAdminSandboxPlatform } from '../admin-api.js';
import {
  buildSandboxPlatformPayload,
  isValidCommandName,
  SANDBOX_TTL_MAX,
  SANDBOX_TTL_MIN,
} from './sandbox-bots-payload.js';

const errorText = (error: unknown, fallback: string): string => (error instanceof Error ? error.message : fallback);

/** Local, per-mount MobX store for `SandboxBotsPage` (ADR 0073 (private)). */
export class SandboxBotsPageStore {
  @observable.ref platforms: readonly IAdminSandboxPlatform[] = [];
  @observable bindingTtlMinutes = 15;
  @observable isLoading = true;
  @observable isSavingTtl = false;
  @observable busyVendor: string | null = null;

  constructor() {
    makeObservable(this);
    this.load();
  }

  @action async load(): Promise<void> {
    this.isLoading = true;
    try {
      const settings = await adminApi.getSandboxSettings();
      runInAction(() => {
        this.platforms = settings.platforms;
        this.bindingTtlMinutes = settings.bindingTtlMinutes;
      });
    } catch (error) {
      message.error(errorText(error, getGlobalI18n().t('workflow-client-admin:sandbox-bots-page.load-failed')));
    }
    runInAction(() => {
      this.isLoading = false;
    });
  }

  @action async saveTtl(minutes: number): Promise<void> {
    this.isSavingTtl = true;
    try {
      const settings = await adminApi.putSandboxTtl(minutes);
      runInAction(() => {
        this.platforms = settings.platforms;
        this.bindingTtlMinutes = settings.bindingTtlMinutes;
      });
      message.success(getGlobalI18n().t('workflow-client-admin:sandbox-bots-page.saved'));
    } catch (error) {
      message.error(errorText(error, getGlobalI18n().t('workflow-client-admin:sandbox-bots-page.save-failed')));
    }
    runInAction(() => {
      this.isSavingTtl = false;
    });
  }

  /** Returns the error text for the token field on `invalid_token`, else `null`. */
  @action async savePlatform(vendor: string, input: { token?: string; commandName: string }): Promise<string | null> {
    this.busyVendor = vendor;
    const t = getGlobalI18n().t;
    try {
      const row = await adminApi.putSandboxPlatform(vendor, input);
      runInAction(() => {
        this.platforms = this.platforms.map((item) => (item.vendor === vendor ? row : item));
      });
      message.success(t('workflow-client-admin:sandbox-bots-page.saved'));
      return null;
    } catch (error) {
      if (error instanceof ApiCodedError && error.code === 'invalid_token') return error.message;
      message.error(errorText(error, t('workflow-client-admin:sandbox-bots-page.save-failed')));
      return null;
    } finally {
      runInAction(() => {
        this.busyVendor = null;
      });
    }
  }

  @action async checkPlatform(vendor: string): Promise<void> {
    this.busyVendor = vendor;
    const t = getGlobalI18n().t;
    try {
      const result = await adminApi.checkSandboxPlatform(vendor);
      if (result.ok) {
        message.success(t('workflow-client-admin:sandbox-bots-page.check-ok', { username: result.username }));
      } else {
        message.error(t('workflow-client-admin:sandbox-bots-page.check-failed', { error: result.error }));
      }
    } catch (error) {
      message.error(errorText(error, t('workflow-client-admin:sandbox-bots-page.check-failed', { error: '' })));
    }
    runInAction(() => {
      this.busyVendor = null;
    });
  }

  @action async removePlatform(vendor: string): Promise<void> {
    this.busyVendor = vendor;
    try {
      await adminApi.deleteSandboxPlatform(vendor);
      await this.load();
    } catch (error) {
      message.error(errorText(error, getGlobalI18n().t('workflow-client-admin:sandbox-bots-page.delete-failed')));
    }
    runInAction(() => {
      this.busyVendor = null;
    });
  }
}

interface IPlatformCardProps {
  readonly platform: IAdminSandboxPlatform;
  readonly store: SandboxBotsPageStore;
}

const PlatformCard: React.FC<IPlatformCardProps> = observer(({ platform, store }) => {
  const t = getGlobalI18n().t;
  const [token, setToken] = useState('');
  const [commandName, setCommandName] = useState(platform.commandName);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const busy = store.busyVendor === platform.vendor;
  const commandValid = isValidCommandName(commandName);

  useEffect(() => {
    setCommandName(platform.commandName);
  }, [platform.commandName]);

  const save = async () => {
    setTokenError(null);
    const error = await store.savePlatform(platform.vendor, buildSandboxPlatformPayload({ token, commandName }));
    if (error) setTokenError(error);
    else setToken('');
  };

  return (
    <Card
      data-testid={`sandbox-bot-card-${platform.vendor}`}
      style={{ marginBottom: 16 }}
      title={
        <span>
          {platform.vendor}{' '}
          {platform.configured ? (
            <Tag color="green">{t('workflow-client-admin:sandbox-bots-page.configured')}</Tag>
          ) : (
            <Tag>{t('workflow-client-admin:sandbox-bots-page.not-configured')}</Tag>
          )}
        </span>
      }
    >
      {platform.configured ? (
        <Typography.Paragraph>
          {platform.title} {platform.username ? `(@${platform.username})` : ''}
        </Typography.Paragraph>
      ) : null}
      <Form layout="vertical">
        <Form.Item
          label={t('workflow-client-admin:sandbox-bots-page.token-label')}
          validateStatus={tokenError ? 'error' : ''}
          help={tokenError ?? (platform.configured ? t('workflow-client-admin:sandbox-bots-page.token-extra') : '')}
        >
          <Input.Password
            data-testid={`sandbox-bot-token-${platform.vendor}`}
            autoComplete="new-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
          />
        </Form.Item>
        <Form.Item
          label={t('workflow-client-admin:sandbox-bots-page.command-label')}
          validateStatus={commandValid ? '' : 'error'}
          help={commandValid ? '' : t('workflow-client-admin:sandbox-bots-page.command-invalid')}
        >
          <Input value={commandName} onChange={(event) => setCommandName(event.target.value)} addonBefore="/" />
        </Form.Item>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type="primary"
            data-testid={`sandbox-bot-save-${platform.vendor}`}
            loading={busy}
            disabled={!commandValid || (!platform.configured && token.trim() === '')}
            onClick={save}
          >
            {t('workflow-client-admin:sandbox-bots-page.save')}
          </Button>
          <Button
            data-testid={`sandbox-bot-check-${platform.vendor}`}
            disabled={!platform.configured || busy}
            onClick={() => store.checkPlatform(platform.vendor)}
          >
            {t('workflow-client-admin:sandbox-bots-page.check')}
          </Button>
          {platform.configured ? (
            <Popconfirm
              title={t('workflow-client-admin:sandbox-bots-page.delete-title')}
              description={t('workflow-client-admin:sandbox-bots-page.delete-description')}
              okText={t('workflow-client-admin:sandbox-bots-page.delete')}
              okButtonProps={{ danger: true }}
              onConfirm={() => store.removePlatform(platform.vendor)}
            >
              <Button danger data-testid={`sandbox-bot-delete-${platform.vendor}`} disabled={busy}>
                {t('workflow-client-admin:sandbox-bots-page.delete')}
              </Button>
            </Popconfirm>
          ) : null}
        </div>
      </Form>
    </Card>
  );
});

/** Admin page "Test bots": the binding lifetime and one card per messenger platform with a sandbox adapter. */
export const SandboxBotsPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [store] = useState(() => new SandboxBotsPageStore());
  const [ttl, setTtl] = useState<number | null>(store.bindingTtlMinutes);

  useEffect(() => {
    setTtl(store.bindingTtlMinutes);
  }, [store.bindingTtlMinutes]);

  return (
    <div style={{ maxWidth: 640 }} data-testid="sandbox-bots-page">
      <Typography.Paragraph>{t('workflow-client-admin:sandbox-bots-page.description')}</Typography.Paragraph>
      <Form layout="vertical">
        <Form.Item label={t('workflow-client-admin:sandbox-bots-page.ttl-label')}>
          <div style={{ display: 'flex', gap: 8 }}>
            <InputNumber
              data-testid="sandbox-bots-ttl"
              min={SANDBOX_TTL_MIN}
              max={SANDBOX_TTL_MAX}
              precision={0}
              value={ttl}
              onChange={(value) => setTtl(value)}
            />
            <Button
              loading={store.isSavingTtl}
              disabled={ttl === null || ttl === store.bindingTtlMinutes}
              onClick={() => {
                if (ttl !== null) store.saveTtl(ttl);
              }}
            >
              {t('workflow-client-admin:sandbox-bots-page.save')}
            </Button>
          </div>
        </Form.Item>
      </Form>
      {!store.isLoading && store.platforms.length === 0 ? (
        <Alert type="info" showIcon message={t('workflow-client-admin:sandbox-bots-page.no-platforms')} />
      ) : null}
      {store.platforms.map((platform) => (
        <PlatformCard key={platform.vendor} platform={platform} store={store} />
      ))}
    </div>
  );
});
