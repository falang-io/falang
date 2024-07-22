import { observer } from 'mobx-react';
import { CELL_SIZE, FONT_SIZE, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { TextStore } from '../store/Text.store';

export const TextComponent: React.FC<{ store: TextStore, x: number, y: number }> = observer(({ store, x, y }) => {
  if (!store.lines.length) return null;
  return <g className='block-component' transform={store.getTranslateValue(x, y)}>
    <InTextComponent store={store} />
  </g>;
});

export const InTextComponent: React.FC<{ store: TextStore }> = observer(({ store }) => {
  return <>{store.lines.length === 1 ? store.lines.map((line, index) => (
    <text
      key={index}
      x={store.startX + (getComputedValue(store.width, 0) - line.width - TEXT_PADDING_WIDTH * 2) / 2}
      y={store.startY + (store.singleLine ? 0 : 0.5 * store.lineHeight)}
      style={{
        fontSize: FONT_SIZE,
      }}
    >
      {line.value}
    </text>
  )) : store.lines.map((line, index) => (
    <text
      key={index}
      x={store.startX}
      y={store.startY + index * store.lineHeight}
      style={{
        fontSize: FONT_SIZE,
      }}
    >
      {line.value}
    </text>
  ))}</>;
});

export interface ICenteredTextParams {
  x: number
  y: number
  width: number
  height: number
  text: string
  textWidth: number
}

export const CenteredText: React.FC<ICenteredTextParams> = ({
  x,
  y,
  width,
  height,
  text,
  textWidth,
}) => {
  return <text
    style={{
      fontSize: FONT_SIZE,
    }}
    x={x + (width -  textWidth) / 2}
    y={y + CELL_SIZE * 1.5}
  >
    { text }
  </text>
}

export interface ITextLabelViewParams {
  x: number
  y: number
  text: string
}

export const TextLabelView: React.FC<ITextLabelViewParams> = ({
  x,
  y,
  text,
}) => {
  return <text
    style={{
      fontSize: FONT_SIZE,
    }}
    x={x + 4}
    y={y + CELL_SIZE - 4}
  >
    { text }
  </text>
}