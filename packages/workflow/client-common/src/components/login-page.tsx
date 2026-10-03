import type React from 'react';
import { useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Button, Checkbox, Form, Input, Typography } from 'antd';
import { authStore } from '../auth-store.js';
import { ApplicationForm } from './application-form.js';
import { AuthMessageScreens } from './auth-message-screens.js';
import { authStyles } from './auth-styles.js';

interface FormValues {
  username: string;
  password: string;
  email?: string;
  acceptTerms?: boolean;
}

const SignInErrors: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const code = authStore.loginErrorCode;
  if (code === 'not_activated') {
    return (
      <Alert type="info" showIcon message={t('client:login-page.error-not-activated')} style={{ marginBottom: 16 }} />
    );
  }
  if (code === 'email_not_verified') {
    const email = authStore.lastLoginIdentifier;
    return (
      <Alert
        type="warning"
        showIcon
        message={t('client:login-page.error-email-not-verified')}
        style={{ marginBottom: 16 }}
        action={
          email && (
            <Button
              size="small"
              disabled={authStore.resendState !== 'idle'}
              loading={authStore.resendState === 'sending'}
              onClick={() => authStore.resendVerification(email)}
            >
              {authStore.resendState === 'sent' ? t('client:login-page.resent') : t('client:login-page.resend')}
            </Button>
          )
        }
      />
    );
  }
  if (authStore.loginError) {
    return (
      <Form.Item>
        <Typography.Text type="danger">{authStore.loginError}</Typography.Text>
      </Form.Item>
    );
  }
  return null;
});

/** Sign-in (and the `open`-mode sign-up variant of the same form). */
const CredentialsForm: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const mode = authStore.signupMode;
  const isSignUp = mode === 'open' && authStore.screen === 'signup';
  const termsUrl = authStore.authConfig?.termsUrl ?? null;
  const canSignUp = mode !== 'off';

  const onFinish = (values: FormValues) => {
    if (isSignUp)
      authStore.register(values.username, values.password, values.acceptTerms === true, values.email?.trim());
    else authStore.login(values.username, values.password);
  };

  return (
    <>
      <Typography.Title level={4} style={authStyles.title}>
        {isSignUp ? t('client:login-page.signup-title') : t('client:login-page.title')}
      </Typography.Title>
      {!isSignUp && authStore.notice && (
        <Alert type="success" showIcon message={t(authStore.notice)} style={{ marginBottom: 16 }} />
      )}
      <Form layout="vertical" onFinish={onFinish} disabled={authStore.isLoggingIn}>
        <Form.Item label={t('client:login-page.username')} name="username" rules={[{ required: true }]}>
          <Input autoFocus />
        </Form.Item>
        {isSignUp && (
          <Form.Item label={t('client:login-page.email-optional')} name="email" rules={[{ type: 'email' }]}>
            <Input type="email" />
          </Form.Item>
        )}
        <Form.Item label={t('client:login-page.password')} name="password" rules={[{ required: true }]}>
          <Input.Password />
        </Form.Item>
        {isSignUp && termsUrl && (
          <Form.Item
            name="acceptTerms"
            valuePropName="checked"
            rules={[
              {
                validator: (_, value: boolean | undefined) =>
                  value ? Promise.resolve() : Promise.reject(new Error(t('client:login-page.terms-required'))),
              },
            ]}
          >
            <Checkbox>
              {t('client:login-page.terms-prefix')}{' '}
              <a href={termsUrl} target="_blank" rel="noreferrer">
                {t('client:login-page.terms-link')}
              </a>
            </Checkbox>
          </Form.Item>
        )}
        <SignInErrors />
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={authStore.isLoggingIn} block>
            {isSignUp ? t('client:login-page.signup-submit') : t('client:login-page.submit')}
          </Button>
        </Form.Item>
      </Form>
      {!isSignUp && authStore.authConfig?.mailConfigured && (
        <Button type="link" block onClick={() => authStore.setScreen('forgot')}>
          {t('client:login-page.forgot-link')}
        </Button>
      )}
      {canSignUp && (
        <Button type="link" block onClick={() => authStore.setScreen(isSignUp ? 'signin' : 'signup')}>
          {isSignUp ? t('client:login-page.have-account') : t('client:login-page.create-account')}
        </Button>
      )}
    </>
  );
});

/**
 * The logged-out area. `AuthStore.screen` is the state machine: sign-in / sign-up (an application
 * form in `application` mode) / "check your e-mail" / forgot + reset password / the result of a
 * mailed `?verifyEmail=` link.
 */
export const LoginPage: React.FC = observer(() => {
  useEffect(() => {
    authStore.loadAuthConfig();
  }, []);

  const screen = authStore.screen;
  const isApplication = authStore.signupMode === 'application' && screen === 'signup';
  const isCredentials = screen === 'signin' || (screen === 'signup' && !isApplication);

  return (
    <div style={authStyles.root}>
      <div style={authStyles.card}>
        {isCredentials && <CredentialsForm />}
        {isApplication && <ApplicationForm />}
        {!isCredentials && !isApplication && <AuthMessageScreens />}
      </div>
    </div>
  );
});
