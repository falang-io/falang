import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import type { ExternalApiHeadBlockEditorStore } from './external-api-head-editor.store.js';
import { TypeScriptBlockContainer } from '../../cmp/typescript-block-container.js';

export const ExternalApiHeadBlockEditorComponent: TBlockEditorView<ExternalApiHeadBlockEditorStore> = observer(
  ({ editor }) => {
    const { data } = editor;
    return (
      <TypeScriptBlockContainer>
        <input className="ts-input" value={data.name} onChange={(e) => editor.setName(e.currentTarget.value)} />
      </TypeScriptBlockContainer>
    );
  },
);
