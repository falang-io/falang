import type React from 'react';
import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Checkbox, Form, Input, Typography } from 'antd';
import { authStore } from '../auth-store.js';

const styles: Record<string, React.CSSProperties> = {
  root: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#1e1e2e',
  },
  card: {
    width: 320,
    padding: 32,
    background: '#181825',
    borderRadius: 8,
    border: '1px solid #313244',
  },
  title: { color: '#cdd6f4', marginBottom: 24, textAlign: 'center' },
};

interface FormValues {
  username: string;
  password: string;
  acceptTerms?: boolean;
}

export const LoginPage: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  useEffect(() => {
    authStore.loadAuthConfig();
  }, []);

  const canSignUp = authStore.authConfig?.selfServiceSignup === true;
  const termsUrl = authStore.authConfig?.termsUrl ?? null;
  const isSignUp = canSignUp && mode === 'signup';

  const onFinish = (values: FormValues) => {
    if (isSignUp) authStore.register(values.username, values.password, values.acceptTerms === true);
    else authStore.login(values.username, values.password);
  };

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <Typography.Title level={4} style={styles.title}>
          {isSignUp ? t('client:login-page.signup-title') : t('client:login-page.title')}
        </Typography.Title>
        <Form layout="vertical" onFinish={onFinish} disabled={authStore.isLoggingIn}>
          <Form.Item label={t('client:login-page.username')} name="username" rules={[{ required: true }]}>
            <Input autoFocus />
          </Form.Item>
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
          {authStore.loginError && (
            <Form.Item>
              <Typography.Text type="danger">{authStore.loginError}</Typography.Text>
            </Form.Item>
          )}
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={authStore.isLoggingIn} block>
              {isSignUp ? t('client:login-page.signup-submit') : t('client:login-page.submit')}
            </Button>
          </Form.Item>
        </Form>
        {canSignUp && (
          <Button type="link" block onClick={() => setMode(isSignUp ? 'signin' : 'signup')}>
            {isSignUp ? t('client:login-page.have-account') : t('client:login-page.create-account')}
          </Button>
        )}
      </div>
    </div>
  );
});
