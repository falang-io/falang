export interface IVericalLine {
  x: number,
  y1: number,
  y2: number,
  shoe?: boolean,
  nextShoe?: boolean,
  targetId: string,
  type: string,
  //tmp
  index?: number,
}

export interface IHorisonatalLine {
  x1: number,
  x2: number,
  y: number,
  shoe: boolean,
  nextShoe: boolean,
  reverseArrow?: boolean,
  targetId: string,
  type: string,
}