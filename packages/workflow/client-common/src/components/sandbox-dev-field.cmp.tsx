import type React from 'react';
import { Button, Form, Switch, Typography } from 'antd';
import { getGlobalI18n } from '@falang/scheme';
import type { IApiSandboxPlatform } from '../api-types.js';

interface ISandboxDevFieldProps {
  readonly platform: IApiSandboxPlatform;
  readonly checked: boolean;
  readonly readOnly: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Present only for a saved instance whose stored `devSandbox` is on. */
  readonly onConnect: (() => void) | null;
}

/** The "Dev: test in the platform bot" switch + "Connect chat" button of an instance editor (ADR 0073 (private)). */
export const SandboxDevField: React.FC<ISandboxDevFieldProps> = ({
  platform,
  checked,
  readOnly,
  onChange,
  onConnect,
}) => {
  const t = getGlobalI18n().t;
  return (
    <Form.Item label={t('client:integrations-editor.sandbox-label')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Switch data-testid="sandbox-dev-switch" checked={checked} disabled={readOnly} onChange={onChange} />
        <span>{t('client:integrations-editor.sandbox-switch', { title: platform.title })}</span>
        {checked && onConnect ? (
          <Button data-testid="sandbox-connect-button" onClick={onConnect}>
            {t('client:integrations-editor.sandbox-connect')}
          </Button>
        ) : null}
      </div>
      {checked ? (
        <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
          {t('client:integrations-editor.sandbox-hint')}
        </Typography.Paragraph>
      ) : null}
    </Form.Item>
  );
};
