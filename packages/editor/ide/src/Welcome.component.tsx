import React from 'react';
import { FrontRootStore } from '@falang/frontend-core';
import { observer } from 'mobx-react';
export const WelcomeComponent: React.FC<{root: FrontRootStore}> = observer(({root}) => {
  const t = root.lang.t;
  return <div style={{
    margin: 'auto',
    width: '600px',
    marginTop: '50px',
  }}>
    <h1>{t('file:no-file-opened')}</h1>
  </div>
});