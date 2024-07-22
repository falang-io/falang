import { observer } from 'mobx-react'
import { FONT_SIZE, LINE_HEIGHT } from '../common/constants'
import { getTextWidth } from '../common/text/getTextWidth'
import { schemeBaseTextStyle } from '../common/text/styles'

export interface ICenteredTextComponentParams {
  x: number
  y: number
  width: number
  height: number
  text: string
}

export const CenteredTextComponent: React.FC<ICenteredTextComponentParams> = observer(({ x, y, width, height, text }) => {
  const realText = text.split('\n')[0];
  const textWidth = getTextWidth(realText);
  const textX = x + Math.round((width - textWidth) / 2);
  const textY = y + Math.round((height + FONT_SIZE) / 2) - 2;
  return <text
    x={textX}
    y={textY}
    style={schemeBaseTextStyle}
  >
    {realText}
  </text>
});
