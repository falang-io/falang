import { observer } from "mobx-react";
import React from 'react'
import { CELL_SIZE, FONT_SIZE, LINE_HEIGHT, TEXT_PADDING_WIDTH } from '@falang/editor-scheme';
import { getComputedValue } from '@falang/editor-scheme';
import { CodeStore } from '../store/Code.store';
import { ITokenLineWord } from '../store/Code2.store';

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

export interface ICodeComponentParams {
  code: CodeStore
  x: number
  y: number
  alwaysOnLeft?: boolean
}

export const CodeComponent: React.FC<ICodeComponentParams> = observer(({ code, x, y, alwaysOnLeft }) => {
  if (!code.renderCode) {
    return null;
  }
  const isInMiddle = code.linesCount === 1 && code.minHeight === CELL_SIZE * 2;
  const startY = isInMiddle ? y + LINE_HEIGHT - 4 + LINE_HEIGHT / 2 : y + LINE_HEIGHT - 4;
  let startX = TEXT_PADDING_WIDTH + x;
  if (code.linesCount === 1 && !alwaysOnLeft) {
    const line = code.computedLines[0];
    if (line.length > 0) {
      const last = line[line.length - 1];
      const width = last.x + last.width;
      startX = x + (getComputedValue(code.width, 0) - width) / 2
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
