import { observer } from 'mobx-react';
import { getTextWidth } from '@falang/editor-scheme';
import { TextLabelView } from './Text.cmp';
import { SelectStore } from '../store/Select.store';

export const SelectStoreViewComponent: React.FC<{store: SelectStore}> = observer(({ store }) => {
  const text = store.selectedText;
  const textWidth = getTextWidth(text);
  const width = store.shape.width;
  return <TextLabelView 
    text={store.selectedText}
    x={store.position.x + (width - textWidth) / 2}
    y={store.position.y}
  />
});
