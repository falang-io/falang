import { observer } from 'mobx-react';
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT } from '../../common/constants';
import { fontFamily, schemeBaseTextStyle } from '../../common/text/styles';
import { SchemeStore } from '../../store/Scheme.store';

export interface ISelectOption {
  text: string
  value: string | number
}

export interface ISelectComponentParams {
  scheme: SchemeStore;
  x: number
  y: number
  width: number
  height: number;
  options: ISelectOption[];
  value: string | number | null;
  onChange: (value: string | number) => void;
}

const getSelectStyle = ({ scheme, x: startX, y: startY, width: shapeWidth, height: shapeHeight }: ISelectComponentParams): React.CSSProperties => {
  const { x, y, scale } = scheme.viewPosition;
  const textX =startX;
  const fontSize = FONT_SIZE * scale;
  const height = shapeHeight * scale;
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

export const SelectComponent: React.FC<ISelectComponentParams> = observer((params: ISelectComponentParams) => {
  //console.log({params});
  const style = getSelectStyle(params);
  return <select
    value={params.value ?? undefined}
    style={style}
    onChange={(e) => params.onChange(e.target.value)}
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
  >
    {params.options.map((option) => <option value={option.value} key={option.value}>{option.text}</option>)}
  </select>
});
