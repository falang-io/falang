import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { getTextAreaStyle } from '@falang/editor-scheme';
import { TextStore } from '../store/Text.store';

export interface ITextEditorComponentParams {
  scheme: SchemeStore
  store: TextStore
  x: number,
  y: number
}

export const TextEditor2Component: React.FC<ITextEditorComponentParams> = observer(({ store, scheme, x, y }) => {
  //console.log({ x, y});
  const style = getTextAreaStyle({
    scheme,
    height: store.singleLine ? CELL_SIZE : store.linesCount * CELL_SIZE,
    width: getComputedValue(store.width, 0),
    x,
    y,
  });
  return <textarea
    className="text-editor"
    onChange={(e) => store.setText(e.target.value)}
    onKeyDown={(e) => {
      if (e.keyCode === 13 && store.singleLine) {
        e.preventDefault();
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
    style={style}
    onClick={(e) => {
      e.stopPropagation();
    }}
    value={store.text}
  />
});
