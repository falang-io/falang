import { observer } from 'mobx-react';
import { SelectComponent } from '@falang/editor-scheme';
import { SelectStore } from '../store/Select.store';

export const SelectStoreEditorComponent: React.FC<{store: SelectStore}> = observer(({ store }) => {
  return <SelectComponent 
    x={store.position.x}
    y={store.position.y}
    height={store.shape.height}
    width={store.shape.width}
    onChange={(value) => store.setValue(String(value))}
    options={store.options.slice()}
    scheme={store.scheme}
    value={store.selectedValue}
  />
});
