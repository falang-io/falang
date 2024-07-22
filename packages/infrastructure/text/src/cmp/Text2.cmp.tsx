import { observer } from 'mobx-react';
import { CELL_SIZE, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { textStyle } from '../util/textStyle';
import { Text2Store } from '../store/Text2.store';

export const Text2Component: React.FC<{ store: Text2Store }> = observer(({ store }) => {
  if (!store.lines.length) return null;
  return <g className='block-component' transform={store.getTranslateValue()}>
    <InText2Component store={store} />
  </g>;
});

const InText2Component: React.FC<{ store: Text2Store }> = observer(({ store }) => {
  return <>{store.lines.length === 1 ? store.lines.map((line, index) => {
    return <text
      key={index}
      x={(store.singleLineAlgin === 'middle' ? ((store.shape.width - line.width - TEXT_PADDING_WIDTH * 2) / 2) : 4)}
      y={store.startY + (store.shape.height > CELL_SIZE ? 0.5 * store.lineHeight : 0)}
      style={textStyle}
    >
      {line.value}
    </text>
  }) : store.lines.map((line, index) => (
    <text
      key={index}
      x={store.startX}
      y={store.startY + index * store.lineHeight}
      style={textStyle}
    >
      {line.value}
    </text>
  ))}</>;
});