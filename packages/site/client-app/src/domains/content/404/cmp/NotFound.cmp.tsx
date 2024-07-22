import React from 'react'
import { observer } from 'mobx-react';

import { FixedWidthLayout } from '../../../core/layout/cmp/FixedWidthLayout.cmp';

import type { TPage } from '../../../core/store/TPage.cmp';

export const NotFoundComponent: TPage = observer(({ root }) => {
  const { i18n } = root;
  const t = i18n.t;  
  return <FixedWidthLayout>
    <h1>{t('base:page-not-found')}</h1>
  </FixedWidthLayout>
});
