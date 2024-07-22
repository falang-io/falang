import { observer } from "mobx-react";
import React, { useEffect } from "react";
import Prism from 'prismjs'; import { ExpressionEditorStore } from './ExpressionEditor.store';
import { PrismLanguages } from '@falang/infrastructure-code';
import { LogicBaseBlockStore } from '../blocks/logic-base/LogicBaseBlock.store';
import { ExpressionStore } from './Expression.store';
import { getTextAreaStyle } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { getCodeTextareaStyle } from '@falang/infrastructure-code';
import { BaseCodeEditor } from '@falang/infrastructure-code';
;

export interface IExpressionEditorComponentParams {
  blockStore?: LogicBaseBlockStore
  store: ExpressionStore
  x: number
  y: number
  borderBottom?: boolean
}

export const ExpressionEditorComponent: React.FC<IExpressionEditorComponentParams> = observer(({ store, x, y, borderBottom, blockStore }) => {
  const editor = store;
  return (
    <BaseCodeEditor
      getAutoCompleteOptions={blockStore ? (code, position) => blockStore.getAutoComplete(code, position) : undefined}
      highlight={(code) => Prism.highlight(code, Prism.languages[PrismLanguages['js']], PrismLanguages['js'])}
      onValueChange={(value) => {
        editor.setExpression(value);
      }}
      onClick={(e) => {
        e.stopPropagation();
      }}
      className="code-editor"
      onKeyDown={(e) => {
        if (e.ctrlKey && e.keyCode === 13) {
          editor.scheme.editing.onCtrlEnter()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Delete') {
          e.stopPropagation();
        }
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      onMouseUp={(e) => {
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
          width: getComputedValue(editor.code.width, 0),
          height: editor.height,
        }),
        //...(borderBottom ? { borderBottom: '1px solid #ccc' } : {}),
      }}
      value={editor.expression}
    />
  );
});
