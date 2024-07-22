import { observer } from 'mobx-react';
import { TBlockComponent } from '@falang/editor-scheme';
import { Text2EditorComponent } from '../../cmp/Text2.editor.cmp';
import { TextBlockStore } from './TextBlockStore';

export const TextBlockEditorComponent: TBlockComponent<TextBlockStore> = observer(({ block }) => {
  return <Text2EditorComponent store={block.textStore} />
  /*return <TextEditorComponent
    id='text-block-editor'
    onChange={(e) => block.setText(e)}
    style={block.textAreaStyle}
    value={block.text}
    onClose={() => block.scheme.editing.onCtrlEnter()}
  />*/
});
