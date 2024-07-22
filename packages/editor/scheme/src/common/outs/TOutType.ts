export type TOutIconType = 'main' | 'break' | 'continue' | 'return' | 'throw';

export interface IThreadsOutItem {
  type: TOutIconType
  level: number
  x: number
  y: number
}

export interface IIconOutLine {
  type: TIconOutLineType,
  sourceId: string,
  targetId: string,
  x: number,
  y: number,
  level: number,
  shoe?: boolean,
}

export type TIconOutLineType = TOutIconType | 'main';
