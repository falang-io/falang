import { TBlockComponent } from '@falang/editor-scheme';
import { observer } from 'mobx-react';
import { LifeGramFunctionFooterBlockStore } from './LifeGramFunctionFooter.block.store';

export const LifeGramFunctionFooterBlockEditorComponent: TBlockComponent<LifeGramFunctionFooterBlockStore> = observer(({ block }) => {
  return (
    <select
      id='icon-block-editor'
      onChange={(e) => block.setTargetId(e.target.value)}
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
        block.setTargetId((e.target as any).value)
      }}
      value={block.targetIcon}
    >
      {block.selectOptions.map((option) => <option value={option.id} key={option.id}>{option.name}</option>)}
    </select>
  );
});
