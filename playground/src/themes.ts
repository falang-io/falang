import { defaultTheme, type ITheme } from '@falang/scheme';

export type TPlaygroundThemeId = 'default' | 'dark' | 'paper';

export interface IPlaygroundTheme {
  readonly id: TPlaygroundThemeId;
  readonly label: string;
  /** Whether the surrounding antd chrome (toolbar, debug panel, modal) switches to the dark algorithm. */
  readonly dark: boolean;
  readonly scheme: ITheme;
}

export const PLAYGROUND_THEMES: readonly IPlaygroundTheme[] = [
  { id: 'default', label: 'Default', dark: false, scheme: defaultTheme },
  {
    id: 'dark',
    label: 'Dark',
    dark: true,
    // Same palette as the workflow client's editor.
    scheme: {
      background: '#1e1e1e',
      gridColor: '#333',
      iconBackground: '#2d2d2d',
      iconBorderColor: '#aaa',
      textColor: '#e0e0e0',
      selectedBorderColor: '#1668dc',
    },
  },
  {
    id: 'paper',
    label: 'Paper (print)',
    dark: false,
    // What `@falang/antd`'s print export uses: white, no grid, black ink.
    scheme: {
      background: 'white',
      gridColor: null,
      iconBackground: 'white',
      iconBorderColor: 'black',
      selectedBorderColor: 'black',
      textColor: 'black',
    },
  },
];

export const getPlaygroundTheme = (id: TPlaygroundThemeId): IPlaygroundTheme =>
  PLAYGROUND_THEMES.find((theme) => theme.id === id) ?? PLAYGROUND_THEMES[0];
