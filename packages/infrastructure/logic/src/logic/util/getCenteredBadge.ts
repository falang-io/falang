import { LINE_HEIGHT } from '@falang/editor-scheme'
import { IBlockBadge } from '@falang/editor-scheme'
import { getTextWidth } from '@falang/editor-scheme'

export interface IGetCenteredBadgeParams {
  text: string
  dx: number
  dy: number
  width: number
  height: number
}

export const getCenteredBadge = ({
  dx,
  dy,
  height,
  text,
  width,
}: IGetCenteredBadgeParams): IBlockBadge => {
  const textWidth = getTextWidth(text);
  const textDx = dx + Math.round((width - textWidth) / 2);
  const textDy = dy + Math.round((height - LINE_HEIGHT) / 2)
  return {
    dx: textDx,
    dy: textDy,
    text,
  };
}
