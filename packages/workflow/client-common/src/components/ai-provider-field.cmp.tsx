import type React from 'react';
import { observer } from 'mobx-react-lite';
import { Alert, Form, Switch, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import { useAiProviderName } from '../ai-provider/ai-provider-name.js';

interface IAiProviderFieldProps {
  readonly checked: boolean;
  /** Whether the deployment's built-in provider is configured (`GET /ai-provider`). */
  readonly configured: boolean;
  readonly readOnly: boolean;
  readonly onChange: (checked: boolean) => void;
}

/**
 * The "built-in provider" switch of an instance editor (ADR 0081 (private)): on = the instance runs on the platform's
 * AI provider, its own endpoint/key fields are hidden. Turned on while the provider is not configured here (an imported
 * project, a provider the admin removed), it warns that the instance won't work on this server.
 */
export const AiProviderField: React.FC<IAiProviderFieldProps> = observer(
  ({ checked, configured, readOnly, onChange }) => {
    const t = getGlobalI18n().t;
    const name = useAiProviderName();
    return (
      <Form.Item label={name}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Switch data-testid="ai-provider-switch" checked={checked} disabled={readOnly} onChange={onChange} />
          <span>{t('client:ai-provider.switch')}</span>
        </div>
        {checked && configured ? (
          <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
            {t('client:ai-provider.switch-hint')}
          </Typography.Paragraph>
        ) : null}
        {checked && !configured ? (
          <Alert
            data-testid="ai-provider-unavailable"
            type="warning"
            showIcon
            style={{ marginTop: 8 }}
            message={t('client:ai-provider.unavailable', { name })}
          />
        ) : null}
      </Form.Item>
    );
  },
);
