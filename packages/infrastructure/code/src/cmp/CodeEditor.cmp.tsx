import { observer } from "mobx-react";
import React, { useEffect } from "react";
import Prism from 'prismjs';
import { IconStore } from '@falang/editor-scheme';
import { CodeStore } from '../store/Code.store';
import { CodeEditorStore } from '../store/CodeEditor.store';
import { BaseCodeEditor } from '../BaseCodeEditor.cmp';
import { getTextAreaStyle } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { getCodeTextareaStyle } from '../utils/codeTextAreaStyle';
import { PrismLanguages } from '../store/PrismLanguages';

export interface ICodeEditorComponentParams {
  store: CodeStore
  x: number
  y: number
  //borderBottom?: boolean
}

export const CodeEditorComponent: React.FC<ICodeEditorComponentParams> = observer(({ store, x, y }) => {
  const editor = store;
  return (
    <BaseCodeEditor
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
          width: getComputedValue(editor.width, 0),
          height: editor.height,
        }),
        //...(borderBottom ? { borderBottom: '1px solid #ccc' } : {}),
      }}
      value={editor.code}
    />
  );
});
