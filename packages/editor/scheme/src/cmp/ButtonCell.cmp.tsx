import { observer } from 'mobx-react'
import { CELL_SIZE } from '../common/constants'
import { SchemeStore } from '../store/Scheme.store'
import { IoIosAddCircleOutline, IoMdRemoveCircleOutline } from "react-icons/io";
import { getInEditorBlockStyle } from '../common/text/getInEditorBlockStyle';

export interface IButtonCellComponentParams extends React.PropsWithChildren {
  onClick: () => void
  scheme: SchemeStore
  x: number
  y: number
}

export const ButtonCellComponent: React.FC<IButtonCellComponentParams> = observer(({
  onClick,
  scheme,
  x,
  y,
  children,
}) => <button
  onClick={(e) => {
    e.stopPropagation();
    onClick();
  }}
  style={{
    ...getInEditorBlockStyle(scheme, x, y, CELL_SIZE, CELL_SIZE),
    border: '1px solid #ccc',
  }}
>
    {children}
  </button>);

export type TButtonIcon = React.FC<{ size: number, style?: React.CSSProperties }>;

export interface IIconButtonCellComponentParams extends IButtonCellComponentParams {
  icon: TButtonIcon,
}

export const IconButtonCellComponent: React.FC<IIconButtonCellComponentParams> = observer(({
  icon: Icon,
  ...params
}) => {
  const { scale } = params.scheme.viewPosition;
  const size = scale * CELL_SIZE;
  return <ButtonCellComponent {...params}><Icon size={size}/></ButtonCellComponent>;
});

export const AddButtonCellComponent: React.FC<IButtonCellComponentParams> = (params) => 
  <IconButtonCellComponent {...params} icon={IoIosAddCircleOutline} />

export const RemoveButtonCellComponent: React.FC<IButtonCellComponentParams> = (params) => 
  <IconButtonCellComponent {...params} icon={IoMdRemoveCircleOutline} />
