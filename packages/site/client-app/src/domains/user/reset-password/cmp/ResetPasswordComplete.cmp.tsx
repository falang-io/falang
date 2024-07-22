import { observer } from 'mobx-react';
import React from 'react';

import { api } from '../../../api/api';
import { FixedWidthLayout } from '../../../core/layout/cmp/FixedWidthLayout.cmp';

import type { TPage } from '../../../core/store/TPage.cmp';

let checkSent = false;

export const ResetPasswordComplete: TPage = observer(({ root }) => {
  const code = root.activationCode;
  const t = root.i18n.t;
  const [header, setHeader] = React.useState<string>(t('base:loading') || '');
  const [text, setText] = React.useState<string>('');

  React.useEffect(() => {
    if (code === null || checkSent) return;
    checkSent = true;
    root.waitFor(async () => {
      try {
        const result = await api.user.registration.resetPasswordCheckCode({ code });
        if(!result.success) {
          throw new Error(t('registration:password_restore_failed') || '');
        }
        setHeader('');
        setText('');        
        root.modals.changePassword.showForType('from-code');
      } catch (err: any) {
        setHeader(t('base:error') || '');
        setText(err.message);
      } finally {
        root.onPageLoaded();
      }
    });
  }, [code, root, t])
  return (
    <FixedWidthLayout>
      <h1>{header}</h1>
      <p>{text}</p>
    </FixedWidthLayout>
  );
});