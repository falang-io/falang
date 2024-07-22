import { observer } from 'mobx-react';
import { TBlockComponent } from '@falang/editor-scheme';
import { LinkBlockStore } from './LinkBlockStore';

export const LinkBlockEditorComponent: TBlockComponent<LinkBlockStore> = observer(({ block }) => {
  return (
    <select
      id='icon-block-editor'
      onChange={(e) => block.setLink(e.target.value)}
      onKeyDown={(e) => {
        if (e.ctrlKey && e.keyCode === 13) {
          block.scheme.editing.onCtrlEnter();
        }
        e.stopPropagation();
      }}
      onMouseUp={(e) => {
        e.stopPropagation();
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onMouseMove={(e) => {
        e.stopPropagation();
      }}
      style={block.selectStyle}
      onClick={(e) => {
        e.stopPropagation();
        block.setLink((e.target as any).value)
      }}
      value={block.schemeId}
    >
      {block.options.map((option) => <option value={option.id} style={{backgroundColor: option.color}} key={option.id}>{option.text}</option>)}
    </select>
  );
});
