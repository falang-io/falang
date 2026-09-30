// oxlint-disable unicorn/prefer-math-trunc
// oxlint-disable typescript/prefer-literal-enum-member
// oxlint-disable no-bitwise
export enum IconFlags {
  None = 0,
  Macro = 1 << 0,
  Threads = 1 << 1,
  Action = 1 << 2,
  Function = 1 << 3,
  If = 1 << 4,
  MindTree = 1 << 5,
  Switch = 1 << 6,
  ForEach = 1 << 7,
  While = 1 << 8,
  Throw = 1 << 9,
  Return = 1 << 10,
  Skewer = 1 << 11,
  Out = 1 << 12,
  List = 1 << 13,
  Cycle = 1 << 14,
  Contour = 1 << 15,
  Header = 1 << 16,
  Footer = 1 << 17,
  Side = 1 << 18,
  WithMods = 1 << 19,
  WithChildren = 1 << 20,
  WithOut = 1 << 21,
  FunctionBody = 1 << 22,
  WithFixedChildren = 1 << 23,
  WithOwnLines = 1 << 24,
  WithLines = 1 << 25,
  /** The icon draws none of its node's descendants; see `resolveVisibleIconId`. */
  HidesChildren = 1 << 26,
}

export const addFlag = (flag: IconFlags | undefined, ...toAdd: IconFlags[]): IconFlags => {
  let returnValue = flag ?? IconFlags.None;
  for (const add of toAdd) {
    returnValue |= add;
  }
  return returnValue;
};
