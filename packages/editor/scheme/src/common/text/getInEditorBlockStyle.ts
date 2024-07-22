import { SchemeStore } from '../../store/Scheme.store';
import { FONT_SIZE, LINE_HEIGHT } from '../constants';
import { schemeBaseTextStyle } from './styles';

export const getInEditorBlockStyle = (
  scheme: SchemeStore,
  textX: number,
  textY: number,
  textWidth: number,
  textHeight?: number): React.CSSProperties => {
  const { x, y, scale } = scheme.viewPosition;
  const left = x + textX * scale;
  const top = y + textY * scale;
  const fontSize = Math.round(FONT_SIZE * scale);
  const lineHeight = LINE_HEIGHT * scale;
  const height = textHeight ? Math.round(textHeight * scale) : null;
  const width = Math.round(textWidth * scale);
  return {
    ...schemeBaseTextStyle,
    padding: `0px`,
    border: 'none',
    overflow: 'hidden',
    margin: 0,
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    lineHeight: `${lineHeight}px`,
    fontSize: `${fontSize}px`,
    height: height ? `${height}px` : undefined,
    width: `${width}px`
  };
}