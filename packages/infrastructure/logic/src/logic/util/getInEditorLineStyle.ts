import { codeStyle } from '@falang/infrastructure-code';
import { FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';

export const getInEditorLineStyle = (scheme: SchemeStore, textX: number, textY: number): React.CSSProperties => { 
  const { x, y, scale } = scheme.viewPosition;
  const left = x + (textX + TEXT_PADDING_WIDTH) * scale;
  const top = y + textY * scale;
  const fontSize = Math.round(FONT_SIZE * scale);
  const lineHeight = LINE_HEIGHT * scale;
  const height = Math.round(LINE_HEIGHT * scale);
  return {
    ...codeStyle,
    padding: `0px`,
    border: 'none',
    margin: 0,
    position: 'absolute',
    left: `${left}px`,
    top: `${top}px`,
    lineHeight: `${lineHeight}px`,
    fontSize: `${fontSize}px`,
    height: `${height - 3}px`,
  };
}