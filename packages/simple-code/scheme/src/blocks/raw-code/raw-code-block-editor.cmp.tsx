import type { TBlockEditorView } from '@falang/scheme';
import { observer } from 'mobx-react-lite';
import { RawCodeEditorComponent } from '../../block-elements/raw-code/raw-code-editor.cmp.js';
import type { RawCodeBlockEditorStore } from './raw-code-block-editor.store.js';

export const RawCodeEditBlockComponent: TBlockEditorView<RawCodeBlockEditorStore> = observer(({ editor }) => (
  <RawCodeEditorComponent store={editor.codeStore} />
));
