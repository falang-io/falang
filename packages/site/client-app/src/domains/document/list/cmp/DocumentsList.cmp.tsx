import { observer } from 'mobx-react';
import moment from 'moment';

import { FixedWidthLayout } from '../../../core/layout/cmp/FixedWidthLayout.cmp';

import type { TPage } from '../../../core/store/TPage.cmp';

import { Link } from 'mobx-router';
import { HTMLTable, Icon } from '@blueprintjs/core';
import { DocumentListInternalComponent } from './DocumentsListInternal.cmp';


export const DocumentListComponent: TPage = observer(({ root }) => {
  const { router, routes, i18n: { t }, documentsList: list } = root;
  return <FixedWidthLayout>
    <h1>{t(`docs:title-${list.type}`)}</h1>
    <DocumentListInternalComponent root={root} />
  </FixedWidthLayout>;
});
