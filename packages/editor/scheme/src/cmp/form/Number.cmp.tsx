import { observer } from 'mobx-react';
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT } from '../../common/constants';
import { fontFamily, schemeBaseTextStyle } from '../../common/text/styles';
import { SchemeStore } from '../../store/Scheme.store';

export interface IInputOption {
  text: string
  value: string | number
}

export interface IInputComponentParams {
  scheme: SchemeStore;
  x: number
  y: number
  width: number
  height?: number;
  value: number;
  onChange: (value: number) => void;
}

const getInputStyle = ({ scheme, x: startX, y: startY, width: shapeWidth, height: shapeHeight }: IInputComponentParams): React.CSSProperties => {
  const { x, y, scale } = scheme.viewPosition;
  const textX =startX;
  const fontSize = FONT_SIZE * scale;
  const height = (shapeHeight ?? CELL_SIZE) * scale;
  const textY = startY;
  const left = x + textX * scale;
  const top = y + textY * scale;
  const lineHeight = LINE_HEIGHT * (scale * 1.2);
  const width = shapeWidth * scale;
  return {
    padding: 0,
    border: `1px solid #ccc`,
    margin: 0,
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    lineHeight: `${lineHeight}px`,
    fontSize: `${fontSize}px`,
    height: height,
    background: 'white',
    ...fontFamily,
  };
}

export const NumberComponent: React.FC<IInputComponentParams> = observer((params: IInputComponentParams) => {
  const style = getInputStyle(params);
  return <input
    value={params.value ?? undefined}
    style={style}
    type='number'
    onChange={(e) => params.onChange(e.target.value ? Number(e.target.value) : 0)}
    onMouseUp={(e) => {
      e.stopPropagation();
    }}
    onMouseDown={(e) => {
      e.stopPropagation();
    }}
    onMouseMove={(e) => {
      e.stopPropagation();
    }}
    onClick={(e) => {
      e.stopPropagation();
      params.onChange((e.target as any).value)
    }}
  />
});
