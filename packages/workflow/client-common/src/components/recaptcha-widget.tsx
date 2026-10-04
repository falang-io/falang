import type React from 'react';
import { useEffect, useRef } from 'react';
import type { ICaptchaControl } from './captcha-control.js';

interface IGrecaptcha {
  ready: (callback: () => void) => void;
  render: (element: HTMLElement, options: { sitekey: string; theme?: 'dark' | 'light' }) => number;
  getResponse: (widgetId: number) => string;
  reset: (widgetId: number) => void;
}

const SCRIPT_SRC = 'https://www.google.com/recaptcha/api.js?render=explicit';
let scriptPromise: Promise<IGrecaptcha> | null = null;

/** Appends Google's script tag on first use; every later caller shares the same promise. */
const loadRecaptcha = (): Promise<IGrecaptcha> => {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<IGrecaptcha>((resolve, reject) => {
    const finish = () => {
      const api = (globalThis as { grecaptcha?: IGrecaptcha }).grecaptcha;
      if (api) api.ready(() => resolve(api));
      else reject(new Error('reCAPTCHA failed to initialise'));
    };
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', finish);
    script.addEventListener('error', () => {
      scriptPromise = null;
      reject(new Error('reCAPTCHA failed to load'));
    });
    document.head.append(script);
  });
  return scriptPromise;
};

interface IProps {
  siteKey: string;
  /** Filled in once the widget has rendered; `null` while it is loading (or unmounted). */
  controlRef: { current: ICaptchaControl | null };
}

/** reCAPTCHA v2 checkbox, rendered explicitly — no wrapper library. */
export const RecaptchaWidget: React.FC<IProps> = ({ siteKey, controlRef }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    loadRecaptcha()
      .then((api) => {
        if (cancelled || !host) return;
        const widgetId = api.render(host, { sitekey: siteKey, theme: 'dark' });
        controlRef.current = {
          getToken: () => api.getResponse(widgetId),
          reset: () => api.reset(widgetId),
        };
      })
      .catch(() => {
        // Script blocked / offline: the parent sees no token and refuses to submit.
      });
    return () => {
      cancelled = true;
      controlRef.current = null;
      if (host) host.innerHTML = '';
    };
  }, [siteKey, controlRef]);

  return <div ref={hostRef} style={{ marginBottom: 16, minHeight: 78 }} />;
};
