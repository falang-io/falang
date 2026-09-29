export type TValencePointType = 'in-skewer' | 'in-switch' | 'side-left';

export interface IValencePoint {
  id: string;
  parentId: string;
  index: number;
  x: number;
  y: number;
  type: TValencePointType;
}
