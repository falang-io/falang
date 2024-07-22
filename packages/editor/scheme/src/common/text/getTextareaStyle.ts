import { FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_HEIGHT, TEXT_PADDING_WIDTH } from '../constants'
import { SchemeStore } from '../../store/Scheme.store'
import { fontFamily } from './styles'

export interface IGetTextAreaStyleParams {
  scheme: SchemeStore
  width: number
  height: number
  x: number
  y: number
}

export const getTextAreaStyle = ({scheme, width: blockWidth, height: blockHeight, x: blockX, y: blockY}: IGetTextAreaStyleParams): React.CSSProperties => {
  const { x, y, scale } = scheme.viewPosition;
  const textX = blockX;
  const textY = blockY;
  const left = x + textX * scale;
  const top = y + (textY + 1) * scale;
  const fontSize = FONT_SIZE * scale;
  const lineHeight = LINE_HEIGHT * scale;
  const height = (blockHeight - TEXT_PADDING_HEIGHT * 2 + LINE_HEIGHT - FONT_SIZE) * scale;
  const width = blockWidth * scale;
  return {
    padding: `${TEXT_PADDING_HEIGHT * scale}px ${(TEXT_PADDING_WIDTH) * scale}px`,
    border: 0,
    margin: 0,
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    lineHeight: `${lineHeight}px`,
    fontSize: `${fontSize}px`,
    height: `${height - 3}px`,
    background: 'transparent',
    ...fontFamily,
  };
}