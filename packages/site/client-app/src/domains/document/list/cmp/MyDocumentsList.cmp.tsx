import { Button, ButtonGroup } from '@blueprintjs/core';
import { observer } from 'mobx-react';
import { FixedWidthLayout } from '../../../core/layout/cmp/FixedWidthLayout.cmp';
import { TPage } from '../../../core/store/TPage.cmp';
import { DocumentListComponent } from './DocumentsList.cmp';
import { DocumentListInternalComponent } from './DocumentsListInternal.cmp';

const templateNames = ['function', 'lifegram', 'tree'];

export const MyDocumentListComponent: TPage = observer(({ root }) => {
  const { router, routes, i18n: { t }, documentsList: list } = root;
  return <>
    <FixedWidthLayout>
      <h1>{t(`docs:title-${list.type}`)}</h1>
      <p>{t('docs:create_new')}: </p>
      <p>
        <ButtonGroup>
          {templateNames.map((template) =>
            <Button key={template} className="btn btn-primary" onClick={() => root.documentEditorPage.createNew(template)}>{t(`templates:template_${template}`)}</Button>
          )}
        </ButtonGroup>
      </p>
      <DocumentListInternalComponent root={root} />
    </FixedWidthLayout>
  </>
});