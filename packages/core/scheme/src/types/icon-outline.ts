import type { IOutType } from '@falang/dto';

export interface IIconOutLine {
  type: TIconOutLineType;
  sourceId: string;
  targetId: string;
  x: number;
  y: number;
  level: number;
  shoe?: boolean;
}

export type TIconOutLineType = IOutType | 'main';
