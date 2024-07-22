import { observer } from 'mobx-react';
import * as React from 'react';
import { MultipleSelectStore } from '../store/MultipleSelect.store';
import { SelectStoreViewComponent } from './SelectStore.view.cmp';

export const MultipleSelectStoreViewComponent: React.FC<{ store: MultipleSelectStore}> = observer(({ store }) => {
  return <>
    {store.selects.map((select, index) => {
      return <React.Fragment key={index}>
        <SelectStoreViewComponent store={select} />
      </React.Fragment>
    })}
  </>
});
