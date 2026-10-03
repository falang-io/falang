import type React from 'react';
import { useState } from 'react';
import { getGlobalI18n } from '@falang/scheme';
import { validateDocumentName, type TDocumentNameError } from '../document-names.js';
import type { WorkflowStore } from '../workflow-store.js';
import { idOf } from './project-tree-helpers.js';
import { RenameModal } from './rename-modal.js';

interface IRenameTarget {
  kind: 'doc' | 'folder';
  id: string;
  name: string;
  /** Document type, for the function-name rule; `null` for a folder. */
  type: string | null;
}

const nameErrorKeys: Record<TDocumentNameError, string> = {
  required: 'client:project-tree.name-required',
  'invalid-function-name': 'client:project-tree.invalid-function-name',
  taken: 'client:project-tree.name-taken',
};

/** The tree's "Rename" flow for documents and (user) folders: `startRename(nodeKey)` opens a validated modal. */
export const useProjectTreeRename = (
  store: WorkflowStore,
): {
  startRename: (nodeKey: string) => void;
  renameModal: React.ReactNode;
  nameErrorMessage: (error: TDocumentNameError) => string;
} => {
  const t = getGlobalI18n().t;
  const [target, setTarget] = useState<IRenameTarget | null>(null);

  const nameErrorMessage = (error: TDocumentNameError): string => t(nameErrorKeys[error]);

  const startRename = (nodeKey: string) => {
    if (nodeKey.startsWith('folder:')) {
      const folder = store.folders.find((item) => item.id === idOf(nodeKey));
      if (folder && !folder.fixedKind) setTarget({ kind: 'folder', id: folder.id, name: folder.name, type: null });
      return;
    }
    const doc = store.documents.find((item) => item.id === idOf(nodeKey));
    if (doc && !doc.pinned) setTarget({ kind: 'doc', id: doc.id, name: doc.name, type: doc.type });
  };

  const validate = (name: string): string | null => {
    if (!target) return null;
    if (target.kind === 'folder') return name.trim() ? null : nameErrorMessage('required');
    const error = validateDocumentName(store.documents, target.type ?? '', name, target.id);
    return error ? nameErrorMessage(error) : null;
  };

  const submit = (name: string) => {
    if (!target) return;
    if (target.kind === 'folder') store.renameFolder(target.id, name);
    else store.renameDocument(target.id, name);
    setTarget(null);
  };

  const renameModal = (
    <RenameModal
      open={target !== null}
      title={t(target?.kind === 'folder' ? 'client:project-tree.rename-folder' : 'client:project-tree.rename-document')}
      initialName={target?.name ?? ''}
      validate={validate}
      onSubmit={submit}
      onClose={() => setTarget(null)}
    />
  );

  return { startRename, renameModal, nameErrorMessage };
};
