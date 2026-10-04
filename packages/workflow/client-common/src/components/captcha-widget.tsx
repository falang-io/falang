import type React from 'react';
import type { ICaptchaControl } from './captcha-control.js';
import { RecaptchaWidget } from './recaptcha-widget.js';
import { SmartCaptchaWidget } from './smartcaptcha-widget.js';

interface IProps {
  provider: 'recaptcha' | 'smartcaptcha';
  siteKey: string;
  controlRef: { current: ICaptchaControl | null };
}

/** Renders the widget of whichever captcha provider the backend announced in `GET /auth/config`. */
export const CaptchaWidget: React.FC<IProps> = ({ provider, siteKey, controlRef }) =>
  provider === 'smartcaptcha' ? (
    <SmartCaptchaWidget siteKey={siteKey} controlRef={controlRef} />
  ) : (
    <RecaptchaWidget siteKey={siteKey} controlRef={controlRef} />
  );
