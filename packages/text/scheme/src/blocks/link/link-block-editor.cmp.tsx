import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { LinkBlockEditorStore } from './link-block-editor.store.js';

export const LinkBlockEditorComponent: TBlockEditorView<LinkBlockEditorStore> = observer(({ editor }) => {
  const options = editor.registry
    ? [...editor.registry.documents.values()].filter((document) => document.id !== editor.currentDocumentId)
    : [];

  return (
    <select value={editor.data.documentId} onChange={(event) => editor.setDocumentId(event.currentTarget.value)}>
      <option value="">—</option>
      {options.map((document) => (
        <option key={document.id} value={document.id}>
          {document.name}
        </option>
      ))}
    </select>
  );
});
