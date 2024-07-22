import { observer } from 'mobx-react';
import * as React from 'react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { SelectStoreEditorComponent } from './SelectStore.editor.cmp';
import { AddButtonCellComponent, RemoveButtonCellComponent } from '@falang/editor-scheme';
import { MultipleSelectStore } from '../store/MultipleSelect.store';

export const MultipleSelectStoreEditorComponent: React.FC<{ store: MultipleSelectStore }> = observer(({ store }) => {
  const length = store.selects.length;
  const bx = store.position.x + store.shape.width;
  return <>
    {store.selects.map((select, index) => {
      return <React.Fragment key={index}>
        <SelectStoreEditorComponent store={select} />
        {length > 1 ? <RemoveButtonCellComponent
          scheme={store.scheme}
          onClick={() => store.removeItem(index)}
          x={bx}
          y={select.position.y}
        /> : null}
      </React.Fragment>
    })}
    <AddButtonCellComponent 
      scheme={store.scheme}
      onClick={() => store.addItem()}
      x={bx}
      y={store.position.y - CELL_SIZE}
    /> 
  </>
});
