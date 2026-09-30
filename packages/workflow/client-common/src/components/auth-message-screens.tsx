import type React from 'react';
import { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Alert, Button, Form, Input, Spin, Typography } from 'antd';
import { authStore, type TAuthScreen } from '../auth-store.js';
import { authStyles } from './auth-styles.js';
import { RecaptchaWidget, type IRecaptchaControl } from './recaptcha-widget.js';

const BackToSignIn: React.FC = () => (
  <Button type="link" block onClick={() => authStore.setScreen('signin')}>
    {getGlobalI18n().t('client:login-page.back-to-signin')}
  </Button>
);

/** "We sent you an e-mail" after an application, with "send again". */
const CheckEmailScreen: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const email = authStore.pendingEmail ?? '';
  return (
    <>
      <Typography.Title level={4} style={authStyles.title}>
        {t('client:login-page.check-email-title')}
      </Typography.Title>
      <Typography.Paragraph>{t('client:login-page.check-email-text', { email })}</Typography.Paragraph>
      <Button
        block
        disabled={authStore.resendState !== 'idle'}
        loading={authStore.resendState === 'sending'}
        onClick={() => authStore.resendVerification(email)}
      >
        {authStore.resendState === 'sent' ? t('client:login-page.resent') : t('client:login-page.resend')}
      </Button>
      <BackToSignIn />
    </>
  );
});

const ForgotScreen: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const captchaRef = useRef<IRecaptchaControl | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  const captcha = authStore.authConfig?.captcha ?? null;

  const onFinish = async (values: { email: string }) => {
    const captchaToken = captchaRef.current?.getToken() ?? '';
    if (captcha && !captchaToken) {
      setCaptchaError(true);
      return;
    }
    setCaptchaError(false);
    const ok = await authStore.forgotPassword(values.email.trim(), captchaToken);
    if (!ok) captchaRef.current?.reset();
  };

  return (
    <>
      <Typography.Title level={4} style={authStyles.title}>
        {t('client:login-page.forgot-title')}
      </Typography.Title>
      <Form layout="vertical" onFinish={onFinish} disabled={authStore.isLoggingIn}>
        <Form.Item label={t('client:login-page.email')} name="email" rules={[{ required: true, type: 'email' }]}>
          <Input type="email" autoFocus />
        </Form.Item>
        {captcha?.provider === 'recaptcha' && <RecaptchaWidget siteKey={captcha.siteKey} controlRef={captchaRef} />}
        {(captchaError || authStore.loginError) && (
          <Form.Item>
            <Typography.Text type="danger">
              {captchaError ? t('client:login-page.captcha-required') : authStore.loginError}
            </Typography.Text>
          </Form.Item>
        )}
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={authStore.isLoggingIn} block>
            {t('client:login-page.forgot-submit')}
          </Button>
        </Form.Item>
      </Form>
      <BackToSignIn />
    </>
  );
});

const ResetScreen: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  return (
    <>
      <Typography.Title level={4} style={authStyles.title}>
        {t('client:login-page.reset-title')}
      </Typography.Title>
      <Form
        layout="vertical"
        onFinish={(values: { password: string }) => authStore.resetPassword(values.password)}
        disabled={authStore.isLoggingIn}
      >
        <Form.Item
          label={t('client:login-page.new-password')}
          name="password"
          rules={[{ required: true }, { min: 8, max: 72 }]}
        >
          <Input.Password autoFocus />
        </Form.Item>
        <Form.Item
          label={t('client:login-page.repeat-password')}
          name="repeat"
          dependencies={['password']}
          rules={[
            { required: true },
            ({ getFieldValue }) => ({
              validator: (_, value: string | undefined) =>
                !value || getFieldValue('password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('client:login-page.passwords-differ'))),
            }),
          ]}
        >
          <Input.Password />
        </Form.Item>
        {authStore.resetError && (
          <Form.Item>
            <Typography.Text type="danger">{authStore.resetError}</Typography.Text>
          </Form.Item>
        )}
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={authStore.isLoggingIn} block>
            {t('client:login-page.reset-submit')}
          </Button>
        </Form.Item>
      </Form>
      <BackToSignIn />
    </>
  );
});

const VerifiedScreen: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const result = authStore.verifyResult;
  return (
    <>
      <Typography.Title level={4} style={authStyles.title}>
        {result === 'error' ? t('client:login-page.verify-failed-title') : t('client:login-page.verified-title')}
      </Typography.Title>
      {result === 'error' && <Alert type="error" showIcon message={t('client:login-page.verify-failed')} />}
      {result === 'pending_activation' && (
        <Alert type="success" showIcon message={t('client:login-page.verified-pending')} />
      )}
      {result === 'active' && <Alert type="success" showIcon message={t('client:login-page.verified-active')} />}
      <BackToSignIn />
    </>
  );
});

/** Every logged-out screen other than the credentials / application forms. */
const ForgotSentScreen: React.FC = () => {
  const t = getGlobalI18n().t;
  return (
    <>
      <Typography.Title level={4} style={authStyles.title}>
        {t('client:login-page.forgot-title')}
      </Typography.Title>
      <Alert type="success" showIcon message={t('client:login-page.forgot-sent')} />
      <BackToSignIn />
    </>
  );
};

const VerifyingScreen: React.FC = () => (
  <div style={{ textAlign: 'center' }}>
    <Spin />
  </div>
);

const SCREENS: Partial<Record<TAuthScreen, React.FC>> = {
  'check-email': CheckEmailScreen,
  forgot: ForgotScreen,
  'forgot-sent': ForgotSentScreen,
  reset: ResetScreen,
  verifying: VerifyingScreen,
  verified: VerifiedScreen,
};

/** Every logged-out screen other than the credentials / application forms. */
export const AuthMessageScreens: React.FC = observer(() => {
  const Screen = SCREENS[authStore.screen];
  return Screen ? <Screen /> : null;
});
