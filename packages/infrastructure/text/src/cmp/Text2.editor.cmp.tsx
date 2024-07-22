import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { getTextAreaStyle } from '@falang/editor-scheme';
import { Text2Store } from '../store/Text2.store';

export interface IText2EditorComponentParams {
  store: Text2Store
}

export const Text2EditorComponent: React.FC<IText2EditorComponentParams> = observer(({ store }) => {
  const style = getTextAreaStyle({
    scheme: store.scheme,
    height: store.shape.height,
    width: store.shape.width,
    x: store.position.x,
    y: store.position.y,
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
