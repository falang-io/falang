import type React from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Button } from 'antd';
import { authStore } from '../auth-store.js';

/**
 * Persistent warning shown while the seeded `admin` account still has the well-known `admin`
 * password (`defaultPasswordInUse` from the login / `GET /auth/me` response). Placed at the top of
 * the project list and of every admin page; clears itself once the password is changed.
 */
export const DefaultPasswordBanner: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  if (!authStore.currentUser?.defaultPasswordInUse) return null;
  return (
    <Alert
      type="warning"
      showIcon
      banner
      message={t('client:default-password-banner.message')}
      action={
        <Button size="small" type="primary" onClick={() => authStore.setChangePasswordOpen(true)}>
          {t('client:default-password-banner.action')}
        </Button>
      }
      style={{ marginBottom: 16 }}
    />
  );
});
