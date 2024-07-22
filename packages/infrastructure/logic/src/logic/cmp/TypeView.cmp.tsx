import { CELL_SIZE } from '@falang/editor-scheme';
import { textStyle } from '@falang/editor-scheme';
import { IVariableTypeViewComponentParams } from '../util/IVariableTypeEditorComponentParams';
import { InlineTypeViewComponent } from './InlineTypeView.cmp';

export const TypeViewComponent: React.FC<IVariableTypeViewComponentParams> = ({
  scheme,
  variableType,
  width,
  x,
  y,
  projectStore,
}) => {  
  if(!variableType) return null;
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
      projectStore={projectStore}
    />
    {variableType.type === 'array' ? <InlineTypeViewComponent
      scheme={scheme}
      variableType={variableType.elementType}
      width={width}
      x={x}
      y={y + CELL_SIZE}
      projectStore={projectStore}
    /> : null}
  </>;
}