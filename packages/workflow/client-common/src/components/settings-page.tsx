import type React from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Card, Descriptions, Typography } from 'antd';
import { LockOutlined } from '@ant-design/icons';
import { authStore } from '../auth-store.js';
import { LanguageSwitcher } from './language-switcher.js';

const styles: Record<string, React.CSSProperties> = {
  root: { width: 640, maxWidth: '100%', margin: '0 auto', padding: '32px 16px' },
  title: { color: '#cdd6f4', marginTop: 0 },
};

/** The user menu's "Settings" page (`#/settings`): the login, "Change password" and the interface language. */
export const SettingsPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const user = authStore.currentUser;
  if (!user) return null;
  return (
    <div style={styles.root} data-testid="settings-page">
      <Typography.Title level={3} style={styles.title}>
        {t('client:settings-page.title')}
      </Typography.Title>
      <Card>
        <Descriptions column={1} colon={false} styles={{ label: { width: 180 } }}>
          <Descriptions.Item label={t('client:settings-page.login')}>
            <span data-testid="settings-login">{user.username}</span>
          </Descriptions.Item>
          {user.email && user.email !== user.username && (
            <Descriptions.Item label={t('client:settings-page.email')}>{user.email}</Descriptions.Item>
          )}
          <Descriptions.Item label={t('client:settings-page.password')}>
            <Button
              icon={<LockOutlined />}
              data-testid="settings-change-password"
              onClick={() => authStore.setChangePasswordOpen(true)}
            >
              {t('client:settings-page.change-password')}
            </Button>
          </Descriptions.Item>
          <Descriptions.Item label={t('client:settings-page.language')}>
            <LanguageSwitcher width={160} />
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
});
