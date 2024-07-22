import { observer } from "mobx-react";
import React, { useEffect } from "react";
import Prism from 'prismjs';
import { Code2Store } from '../store/Code2.store';
import { BaseCodeEditor } from '../BaseCodeEditor.cmp';
import { getComputedValue } from '@falang/editor-scheme';
import { BlockStore, checker } from '@falang/editor-scheme';
import { getCodeTextareaStyle } from '../utils/codeTextAreaStyle';
import { PrismLanguages } from '../store/PrismLanguages';

export interface ICode2EditorComponentParams {
  store: Code2Store
  blockStore?: BlockStore
}

export const Code2EditorComponent: React.FC<ICode2EditorComponentParams> = observer(({ store: editor, blockStore }) => {
  const x = editor.position.x;
  const y = editor.position.y;
  console.log({ blockStore });
  return (
    <BaseCodeEditor
      getAutoCompleteOptions={blockStore && checker.isBlockWithAutoComplete(blockStore) ? (code, position) => blockStore.getAutoComplete(code, position) : undefined}
      highlight={(code) => Prism.highlight(code, Prism.languages[PrismLanguages[editor.language]], PrismLanguages[editor.language])}
      onValueChange={(value) => {
        editor.setCode(value);
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      className="code-editor"
      onKeyDown={(e) => {
        if (e.ctrlKey && e.keyCode === 13) {
          editor.scheme.editing.onCtrlEnter()
        } else if (e.keyCode === 13 && editor.singleLine) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Delete') {
          e.stopPropagation();
        }
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
      style={{
        ...getCodeTextareaStyle({
          scheme: editor.scheme,
          x,
          y,
          width: getComputedValue(editor.shape.width, 0),
          height: editor.height,
        }),
        //...(borderBottom ? { borderBottom: '1px solid #ccc' } : {}),
      }}
      value={editor.code}
    />
  );
});
