import type React from 'react';
import { useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { getGlobalI18n } from '@falang/scheme';
import { Button, Checkbox, Form, Input, Typography } from 'antd';
import { authStore } from '../auth-store.js';
import { authStyles } from './auth-styles.js';
import { CaptchaWidget } from './captcha-widget.js';
import type { ICaptchaControl } from './captcha-control.js';

interface IValues {
  email: string;
  companyName: string;
  automationInterest: string;
  acceptTerms?: boolean;
}

/** Closed-beta application (`signupMode: 'application'`). */
export const ApplicationForm: React.FC = observer(() => {
  const t = getGlobalI18n().t;
  const captchaRef = useRef<ICaptchaControl | null>(null);
  const [captchaError, setCaptchaError] = useState(false);
  const termsUrl = authStore.authConfig?.termsUrl ?? null;
  const captcha = authStore.authConfig?.captcha ?? null;

  const onFinish = async (values: IValues) => {
    const captchaToken = captchaRef.current?.getToken() ?? '';
    if (captcha && !captchaToken) {
      setCaptchaError(true);
      return;
    }
    setCaptchaError(false);
    const ok = await authStore.apply({
      email: values.email.trim(),
      companyName: values.companyName.trim(),
      automationInterest: values.automationInterest.trim(),
      acceptTerms: values.acceptTerms === true,
      captchaToken,
    });
    // A captcha response is single use: a rejected submit needs a fresh one.
    if (!ok) captchaRef.current?.reset();
  };

  return (
    <>
      <Typography.Title level={4} style={authStyles.title}>
        {t('client:login-page.apply-title')}
      </Typography.Title>
      <Typography.Paragraph type="secondary">{t('client:login-page.apply-intro')}</Typography.Paragraph>
      <Form layout="vertical" onFinish={onFinish} disabled={authStore.isLoggingIn}>
        <Form.Item label={t('client:login-page.email')} name="email" rules={[{ required: true, type: 'email' }]}>
          <Input type="email" autoFocus />
        </Form.Item>
        <Form.Item label={t('client:login-page.company')} name="companyName" rules={[{ required: true, max: 200 }]}>
          <Input />
        </Form.Item>
        <Form.Item
          label={t('client:login-page.interest')}
          name="automationInterest"
          rules={[{ required: true, max: 2000 }]}
        >
          <Input.TextArea rows={3} />
        </Form.Item>
        {termsUrl && (
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
        {captcha && <CaptchaWidget provider={captcha.provider} siteKey={captcha.siteKey} controlRef={captchaRef} />}
        {captchaError && (
          <Form.Item>
            <Typography.Text type="danger">{t('client:login-page.captcha-required')}</Typography.Text>
          </Form.Item>
        )}
        {authStore.loginError && (
          <Form.Item>
            <Typography.Text type="danger">{authStore.loginError}</Typography.Text>
          </Form.Item>
        )}
        <Form.Item>
          <Button type="primary" htmlType="submit" loading={authStore.isLoggingIn} block>
            {t('client:login-page.apply-submit')}
          </Button>
        </Form.Item>
      </Form>
      <Button type="link" block onClick={() => authStore.setScreen('signin')}>
        {t('client:login-page.have-account')}
      </Button>
    </>
  );
});
