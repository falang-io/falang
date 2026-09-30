import type { ITheme } from '@falang/scheme';

/** Applied to every print scheme regardless of the host's own theme: white paper, no grid, black ink. */
export const PRINT_THEME: ITheme = {
  background: 'white',
  gridColor: null,
  iconBackground: 'white',
  iconBorderColor: 'black',
  selectedBorderColor: 'black',
  textColor: 'black',
};
