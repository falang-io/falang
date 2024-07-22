import { SchemeStore } from '@falang/editor-scheme'
import { FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_HEIGHT, TEXT_PADDING_WIDTH } from '@falang/editor-scheme'
import { getComputedValue } from '@falang/editor-scheme'
import { codeStyle } from '../store/Code.store'

export interface IGetCodeTextAreaStyleParams {
  scheme: SchemeStore
  width: number
  height: number
  x: number
  y: number
}

export const getCodeTextareaStyle = ({ scheme, x: textX, y: textY, width: textWidth, height: textHeight }: IGetCodeTextAreaStyleParams): React.CSSProperties => {
  const { x, y, scale } = scheme.viewPosition;
  const left = x + (textX + TEXT_PADDING_WIDTH) * scale;
  const top = y + (textY + TEXT_PADDING_HEIGHT) * scale;
  const fontSize = Math.round(FONT_SIZE * scale);
  const lineHeight = LINE_HEIGHT * scale;
  const height = Math.round((textHeight - TEXT_PADDING_HEIGHT * 2 + LINE_HEIGHT - FONT_SIZE) * scale);
  const width = Math.round((getComputedValue(textWidth, 0) - TEXT_PADDING_WIDTH * 2) * scale) - 2;
  return {
    ...codeStyle,
    padding: `${TEXT_PADDING_HEIGHT * scale}px 0px`,
    margin: 0,
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    lineHeight: `${lineHeight}px`,
    fontSize: `${fontSize}px`,
    height: `${height - 3}px`,
  };
}
