import { observer } from 'mobx-react';
import { InlineTypeStore } from '../store/InlineType.store';
import { InlineTypeViewComponent } from './InlineTypeView.cmp';

interface IInlineType2ViewComponentParams {
  store: InlineTypeStore
}

export const InlineType2ViewComponent: React.FC<IInlineType2ViewComponentParams> = observer(({ store }: IInlineType2ViewComponentParams) => {
  return <InlineTypeViewComponent 
    scheme={store.scheme}
    variableType={store.get()}
    width={store.shape.width}
    x={store.position.x}
    y={store.position.y}
    projectStore={store.projectStore}  
  />;
});

