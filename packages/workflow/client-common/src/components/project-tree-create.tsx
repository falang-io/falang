import type React from 'react';
import { useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { validateDocumentName, type TDocumentNameError } from '../document-names.js';
import type { WorkflowStore } from '../workflow-store.js';
import type { DocumentType } from '../workflow-types.js';
import { getFolderLabel, getPlaceholders, ITEM_ICONS } from './project-tree-helpers.js';
import { NameModal } from '@falang/antd';

export type TNewTreeItemType = DocumentType | 'folder';

interface INewItem {
  type: TNewTreeItemType;
  parentId: string | null;
}

const titleKeys: Record<string, string> = {
  folder: 'client:project-tree.new-folder-title',
  function: 'client:project-tree.new-function-title',
  'objects-structure': 'client:project-tree.new-object-title',
  table: 'client:project-tree.new-table-title',
};

/** The tree's "create a document/folder" flow: `startCreate(type, parentId)` opens a validated name dialog. */
export const useProjectTreeCreate = (
  store: WorkflowStore,
  nameErrorMessage: (error: TDocumentNameError) => string,
  onCreated: (parentId: string | null) => void,
): { startCreate: (type: TNewTreeItemType, parentId: string | null) => void; createModal: React.ReactNode } => {
  const t = getGlobalI18n().t;
  const [item, setItem] = useState<INewItem | null>(null);

  const validate = (name: string): string | null => {
    if (!item) return null;
    if (item.type === 'folder') return name.trim() ? null : nameErrorMessage('required');
    const error = validateDocumentName(store.documents, item.type, name);
    return error ? nameErrorMessage(error) : null;
  };

  const submit = (name: string) => {
    if (!item) return;
    if (item.type === 'folder') store.createFolder(name, item.parentId);
    else store.createDocument(item.type, name, item.parentId);
    onCreated(item.parentId);
    setItem(null);
  };

  const createModal = (
    <NameModal
      open={item !== null}
      title={
        item && (
          <>
            {ITEM_ICONS[item.type]} {t(titleKeys[item.type] ?? 'client:project-tree.new-function-title')}
          </>
        )
      }
      initialName=""
      okText={t('client:project-tree.create-ok')}
      {...(item ? { placeholder: getPlaceholders(t)[item.type] } : {})}
      hint={item && t('client:project-tree.in-folder', { folder: getFolderLabel(store, item.parentId, t) })}
      inputTestId="new-item-name-input"
      validate={validate}
      onSubmit={submit}
      onClose={() => setItem(null)}
    />
  );

  return { startCreate: (type, parentId) => setItem({ type, parentId }), createModal };
};
