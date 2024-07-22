import { observer } from 'mobx-react';
import { CELL_SIZE } from '@falang/editor-scheme';
import { textStyle } from '@falang/editor-scheme';
import { IVariableTypeViewComponentParams } from '../util/IVariableTypeEditorComponentParams';
import { InlineTypeViewComponent } from './InlineTypeView.cmp';
import { InlineTypeStore } from '../store/InlineType.store';

export interface ITypeView2ComponentParams {
  store: InlineTypeStore
}

export const TypeView2Component: React.FC<ITypeView2ComponentParams> = observer(({ store }) => {  
  const variableType = store.get();
  if(!variableType) return null;
  const scheme = store.scheme;
  const width = store.shape.width;
  const x = store.position.x;
  const y = store.position.y;
  const t = scheme.frontRoot.lang.t;
  return <>
    {/*<line
      className='inblock-line'
      x1={x}
      x2={x + width}
      y1={y + CELL_SIZE}
      y2={y + CELL_SIZE}
/>*/}
    <InlineTypeViewComponent
      scheme={scheme}
      variableType={variableType}
      width={width}
      x={x}
      y={y}
      projectStore={store.projectStore}
    />
    {variableType.type === 'array' ? <InlineTypeViewComponent
      scheme={scheme}
      variableType={variableType.elementType}
      width={width}
      x={x}
      y={y + CELL_SIZE}
      projectStore={store.projectStore}
    /> : null}
  </>;
});
