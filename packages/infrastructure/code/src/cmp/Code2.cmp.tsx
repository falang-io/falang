import { observer } from "mobx-react";
import React from 'react'
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { Code2Store, ITokenLineWord } from '../store/Code2.store';

interface IRenderLineProps {
  y: number
  x: number
  words: ITokenLineWord[]
  style: React.CSSProperties
}

const renderLine: React.FC<IRenderLineProps> = ({ x, y, words, style }) => {
  return <>{words.map((word, index) => <text
    x={x + word.x}
    y={y}
    key={index}
    style={style}
    className={word.className}
  >
    {word.value}
  </text>)}</>;
}

export interface ICode2ComponentParams {
  store: Code2Store
}

export const Code2Component: React.FC<ICode2ComponentParams> = observer(({ store: code }) => {
  if (!code.renderCode2) {
    return null;
  }
  const y = code.position.y;
  const x = code.position.x;
  const isInMiddle = code.linesCount === 1 && code.minHeight === CELL_SIZE * 2;
  const startY = isInMiddle ? y + LINE_HEIGHT - 4 + LINE_HEIGHT / 2 : y + LINE_HEIGHT - 4;
  let startX = TEXT_PADDING_WIDTH + x;
  if (code.linesCount === 1 && !code.alwaysOnLeft) {
    const line = code.computedLines[0];
    if (line.length > 0) {
      const last = line[line.length - 1];
      const width = last.x + last.width;
      startX = x + (code.shape.width - width) / 2
    }
  }
  return <g className={`code-component language-${code.language}`}>
    {code.computedLines.map((words, index) =>
      <g key={index}>
        {renderLine({
          style: {
            fontSize: `${FONT_SIZE * code.scheme.viewPosition.scale}`,
          },
          words,
          x: startX,
          y: startY + index * LINE_HEIGHT,
        })}
      </g>
    )}
  </g>;
});
