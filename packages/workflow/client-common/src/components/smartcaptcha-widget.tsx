import type React from 'react';
import { useEffect, useRef } from 'react';
import type { ICaptchaControl } from './captcha-control.js';

interface ISmartCaptcha {
  render: (element: HTMLElement, options: { sitekey: string; hl?: string }) => number;
  getResponse: (widgetId: number) => string;
  reset: (widgetId: number) => void;
  destroy: (widgetId: number) => void;
}

const CALLBACK_NAME = '__falangSmartCaptchaOnload';
const SCRIPT_SRC = `https://smartcaptcha.yandexcloud.net/captcha.js?render=onload&onload=${CALLBACK_NAME}`;
let scriptPromise: Promise<ISmartCaptcha> | null = null;

/** Appends Yandex's script tag on first use; every later caller shares the same promise. */
const loadSmartCaptcha = (): Promise<ISmartCaptcha> => {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<ISmartCaptcha>((resolve, reject) => {
    const host = globalThis as unknown as Record<string, unknown>;
    host[CALLBACK_NAME] = () => {
      const api = (globalThis as { smartCaptcha?: ISmartCaptcha }).smartCaptcha;
      if (api) resolve(api);
      else reject(new Error('SmartCaptcha failed to initialise'));
    };
    const script = document.createElement('script');
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('error', () => {
      scriptPromise = null;
      reject(new Error('SmartCaptcha failed to load'));
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

/** Yandex SmartCaptcha, rendered explicitly after the script's onload callback. */
export const SmartCaptchaWidget: React.FC<IProps> = ({ siteKey, controlRef }) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let widgetId: number | null = null;
    let api: ISmartCaptcha | null = null;
    const host = hostRef.current;
    loadSmartCaptcha()
      .then((loaded) => {
        if (cancelled || !host) return;
        api = loaded;
        const id = loaded.render(host, { sitekey: siteKey });
        widgetId = id;
        controlRef.current = {
          getToken: () => loaded.getResponse(id),
          reset: () => loaded.reset(id),
        };
      })
      .catch(() => {
        // Script blocked / offline: the parent sees no token and refuses to submit.
      });
    return () => {
      cancelled = true;
      controlRef.current = null;
      if (api && widgetId !== null) api.destroy(widgetId);
      if (host) host.innerHTML = '';
    };
  }, [siteKey, controlRef]);

  return <div ref={hostRef} style={{ marginBottom: 16, minHeight: 100 }} />;
};
