import type React from 'react';
import { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Button } from 'antd';
import { workflowApi } from '../api-client.js';
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

/**
 * Shown when the signed-in account has an e-mail address the user has not confirmed yet (`open` mode
 * signup with the optional e-mail). Same non-fixed placement as `DefaultPasswordBanner`.
 */
export const EmailNotVerifiedBanner: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const user = authStore.currentUser;
  if (!user?.email || user.emailVerified !== false) return null;
  const email = user.email;
  const resend = async () => {
    setState('sending');
    try {
      await workflowApi.resendVerification(email);
    } catch {
      // Uniform 202 by design; a network error just lets the user press again.
    }
    setState('sent');
  };
  return (
    <Alert
      type="warning"
      showIcon
      banner
      message={t('client:email-not-verified-banner.message', { email })}
      action={
        <Button size="small" type="primary" disabled={state !== 'idle'} loading={state === 'sending'} onClick={resend}>
          {state === 'sent' ? t('client:email-not-verified-banner.sent') : t('client:email-not-verified-banner.action')}
        </Button>
      }
      style={{ marginBottom: 16 }}
    />
  );
});
