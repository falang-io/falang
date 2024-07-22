import { CELL_SIZE } from '@falang/editor-scheme';
import { schemeBaseTextStyle } from '@falang/editor-scheme';
import { IVariableTypeViewComponentParams } from '../util/IVariableTypeEditorComponentParams';

export const InlineTypeViewComponent: React.FC<IVariableTypeViewComponentParams> = ({
  scheme,
  variableType,
  width,
  x,
  y,
  projectStore,
}) => {
  const vType = variableType;
  if(!vType) return null;
  const t = scheme.frontRoot.lang.t;  
  if (!vType) return null;
  return <>
    <text
      className='inblock-text'
      style={schemeBaseTextStyle}
      x={x + 4}
      y={y + CELL_SIZE - 4}
    >
      {variableType.type === 'number' ? t(`logic:${variableType.numberType}`) : t(`logic:${variableType.type}`)}
    </text>
    <line
      className='inblock-line'
      x1={x}
      x2={x + width}
      y1={y}
      y2={y}
    />
    {vType.type === 'number' ?     <line
      className='inblock-line'
      x1={x + CELL_SIZE * 4}
      x2={x + CELL_SIZE * 4}
      y1={y}
      y2={y + CELL_SIZE}
    /> : null}

    {vType.type === 'number' && vType.numberType === 'decimal' ? <>
      <line
        className='inblock-line'
        x1={x + CELL_SIZE * 7}
        x2={x + CELL_SIZE * 7}
        y1={y}
        y2={y + CELL_SIZE}
      />
      <text
        style={schemeBaseTextStyle}
        className='inblock-text'
        x={x + CELL_SIZE * 4 + 4}
        y={y + CELL_SIZE - 4}
      >
        {vType.digits}
      </text>
      <text
        style={schemeBaseTextStyle}
        className='inblock-text'
        x={x + CELL_SIZE * 7 + 4}
        y={y + CELL_SIZE - 4}
      >
        {vType.decimals}
      </text>

    </> : null}
    {(vType.type === 'number' && vType.numberType !== 'decimal' && vType.numberType !== 'any') ? <text
      style={schemeBaseTextStyle}
      x={x + 4 + CELL_SIZE * 4}
      y={y + CELL_SIZE - 4}
      className='inblock-text'
    >
      {t(`logic:${vType.numberType === 'float' ? vType.floatType : vType.integerType}`)}
    </text> : null}
    {vType.type === 'struct' ? <>
    <line
      className='inblock-line'
      x1={x + CELL_SIZE * 4}
      x2={x + CELL_SIZE * 4}
      y1={y}
      y2={y + CELL_SIZE}
    />
    <text
      style={schemeBaseTextStyle}
      x={x + 4 + CELL_SIZE * 4}
      y={y + CELL_SIZE - 4}
      className='inblock-text'
    >
      {vType.name}
    </text>
    </> : null}
    {vType.type === 'enum' ? <>
    <line
      className='inblock-line'
      x1={x + CELL_SIZE * 4}
      x2={x + CELL_SIZE * 4}
      y1={y}
      y2={y + CELL_SIZE}
    />
    <text
      style={schemeBaseTextStyle}
      x={x + 4 + CELL_SIZE * 4}
      y={y + CELL_SIZE - 4}
      className='inblock-text'
    >
      {projectStore.getEnumName(vType.iconId, vType.schemeId)}
    </text>
    </> : null}
  </>;
}