import type React from 'react';
import { useEffect, useState } from 'react';
import { Alert, Button, InputNumber, message, Spin, Switch, Tooltip, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { workflowApi, type IApiRuntimeSettings, type TApiRunnerEnv } from '../api-client.js';
import { ApiCodedError } from '../api-coded-error.js';
import { useClientExtensions } from '../extensions/client-extensions.js';
import {
  buildRuntimeSettingsInput,
  effectiveIdleMinutes,
  formatClock,
  isRuntimeFormEqual,
  toRuntimeForm,
  validateRuntimeForm,
  type IRuntimeSettingsForm,
} from '../runtime-settings-model.js';

interface Props {
  readonly projectId: string;
}

const ENVS: readonly TApiRunnerEnv[] = ['dev', 'prod'];

/**
 * "Project servers" (ADR 0067 (private) §2): per environment (dev stand / production versions) the current state,
 * the idle-stop period and the "always on" switch. Owner only; the host may add a price line per section. A tab of
 * the project "Settings" modal, with its own Save button.
 */
export const RuntimeSettingsPanel: React.FC<Props> = ({ projectId }) => {
  const t = getGlobalI18n().t;
  const extensions = useClientExtensions();
  const [settings, setSettings] = useState<IApiRuntimeSettings | null>(null);
  const [form, setForm] = useState<IRuntimeSettingsForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const apply = (next: IApiRuntimeSettings): void => {
    setSettings(next);
    setForm(toRuntimeForm(next));
  };

  useEffect(() => {
    setSettings(null);
    setForm(null);
    setErrorMessage(null);
    workflowApi
      .getRuntimeSettings(projectId)
      .then(apply)
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : t('client:runtime-settings.failed-to-load')),
      );
  }, [projectId, t]);

  const errors = settings && form ? validateRuntimeForm(form, settings.limits.maxIdleMinutes) : null;
  const dirty = settings && form ? !isRuntimeFormEqual(form, toRuntimeForm(settings)) : false;
  const invalid = errors !== null && (errors.dev !== null || errors.prod !== null);

  const save = (): void => {
    if (!form) return;
    setSaving(true);
    setErrorMessage(null);
    workflowApi
      .putRuntimeSettings(projectId, buildRuntimeSettingsInput(form))
      .then((next) => {
        apply(next);
        message.success(t('client:runtime-settings.saved'));
      })
      .catch((error: unknown) => {
        if (error instanceof ApiCodedError && error.code === 'always_on_not_allowed') {
          setErrorMessage(t('client:runtime-settings.always-on-not-allowed'));
        } else {
          setErrorMessage(error instanceof Error ? error.message : t('client:runtime-settings.failed-to-save'));
        }
      })
      .finally(() => setSaving(false));
  };

  const updateEnv = (env: TApiRunnerEnv, patch: Partial<IRuntimeSettingsForm['dev']>): void =>
    setForm((current) => (current ? { ...current, [env]: { ...current[env], ...patch } } : current));

  const stateLine = (env: TApiRunnerEnv): string => {
    if (!settings) return '';
    if (env === 'dev') {
      const { running, since } = settings.state.dev;
      return running && since
        ? t('client:runtime-settings.state-running-since', { time: formatClock(since) })
        : t('client:runtime-settings.state-stopped');
    }
    const { running, since, instances } = settings.state.prod;
    if (!running) return t('client:runtime-settings.state-stopped');
    return t('client:runtime-settings.state-prod-running', { count: instances, time: since ? formatClock(since) : '' });
  };

  const explanation = (env: TApiRunnerEnv): string => {
    if (!settings || !form) return '';
    const minutes = effectiveIdleMinutes(form[env], settings.defaults.idleMinutes);
    return minutes === null
      ? t('client:runtime-settings.explain-always-on')
      : t('client:runtime-settings.explain-idle', { count: minutes });
  };

  return (
    <div data-testid="runtime-settings">
      {errorMessage && <Alert type="error" showIcon message={errorMessage} style={{ marginBottom: 12 }} />}
      {settings === null && !errorMessage && <Spin />}
      {settings && form && errors && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {ENVS.map((env) => {
            const alwaysOnBlocked = !settings.limits.alwaysOnAllowed;
            const envError = errors[env];
            return (
              <section key={env} data-testid={`runtime-section-${env}`}>
                <Typography.Title level={5} style={{ marginTop: 0 }}>
                  {t(`client:runtime-settings.env-${env}`)}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }} data-testid={`runtime-state-${env}`}>
                  {stateLine(env)}
                </Typography.Paragraph>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <Tooltip title={alwaysOnBlocked ? t('client:runtime-settings.always-on-blocked') : ''}>
                    <Switch
                      checked={form[env].alwaysOn}
                      disabled={alwaysOnBlocked && !form[env].alwaysOn}
                      onChange={(value) => updateEnv(env, { alwaysOn: value })}
                      data-testid={`runtime-always-on-${env}`}
                    />
                  </Tooltip>
                  <span>{t('client:runtime-settings.always-on')}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span>{t('client:runtime-settings.idle-minutes')}</span>
                  <InputNumber
                    style={{ width: 220 }}
                    min={1}
                    max={settings.limits.maxIdleMinutes}
                    precision={0}
                    value={form[env].idleMinutes}
                    disabled={form[env].alwaysOn}
                    placeholder={t('client:runtime-settings.idle-default', { count: settings.defaults.idleMinutes })}
                    status={envError ? 'error' : ''}
                    onChange={(value) => updateEnv(env, { idleMinutes: typeof value === 'number' ? value : null })}
                    data-testid={`runtime-idle-minutes-${env}`}
                  />
                </div>
                {envError && (
                  <Typography.Text type="danger">
                    {t(`client:runtime-settings.error-${envError}`, { max: settings.limits.maxIdleMinutes })}
                  </Typography.Text>
                )}
                <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>
                  {explanation(env)}
                </Typography.Paragraph>
                {extensions.renderRuntimeCost?.({ projectId, env })}
              </section>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="primary"
              loading={saving}
              disabled={!dirty || invalid}
              onClick={save}
              data-testid="runtime-settings-save"
            >
              {t('client:runtime-settings.save')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
