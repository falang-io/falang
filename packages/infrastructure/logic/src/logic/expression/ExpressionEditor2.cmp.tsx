import { observer } from "mobx-react";
import React, { useEffect } from "react";
import Prism from 'prismjs'; 
import { LogicBaseBlockStore } from '../blocks/logic-base/LogicBaseBlock.store';
import { ExpressionStore } from './Expression.store';
import { getComputedValue } from '@falang/editor-scheme';
import { checker } from '@falang/editor-scheme';
import { BaseCodeEditor, PrismLanguages } from '@falang/infrastructure-code';
import { getCodeTextareaStyle } from '@falang/infrastructure-code';

export interface IExpressionEditor2ComponentParams {
  blockStore?: LogicBaseBlockStore
  store: ExpressionStore
  x: number
  y: number
  borderBottom?: boolean
}

export const ExpressionEditor2Component: React.FC<IExpressionEditor2ComponentParams> = observer(({ store, x, y, borderBottom, blockStore }) => {
  const editor = store;
  //console.log('ed2');
  return (
    <BaseCodeEditor
      getAutoCompleteOptions={blockStore && checker.isBlockWithAutoComplete(blockStore) ? (code, position) => blockStore.getAutoComplete(code, position) : undefined}
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
          //editor.onBlur()
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
        ...(borderBottom ? { borderBottom: '1px solid #ccc' } : {}),
      }}
      value={editor.expression}
    />
  );
});
