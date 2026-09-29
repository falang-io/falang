import type React from 'react';
import { Button, Form, Tag } from 'antd';
import { getGlobalI18n } from '@falang/scheme';

interface IOAuth2ConnectionFieldProps {
  readonly connected: boolean;
  readonly connecting: boolean;
  readonly onConnect: () => void;
}

/** The "Connect"/"Reconnect" button + status tag shown for an OAuth2-authed vendor — see `IntegrationsEditor`. */
export const OAuth2ConnectionField: React.FC<IOAuth2ConnectionFieldProps> = ({ connected, connecting, onConnect }) => {
  const t = getGlobalI18n().t;
  return (
    <Form.Item label={t('client:integrations-editor.oauth2-connection')}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button onClick={onConnect} loading={connecting}>
          {connected
            ? t('client:integrations-editor.oauth2-reconnect')
            : t('client:integrations-editor.oauth2-connect')}
        </Button>
        {connected && <Tag color="green">{t('client:integrations-editor.oauth2-connected-tag')}</Tag>}
      </div>
    </Form.Item>
  );
};
