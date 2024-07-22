export const Languages = ['ru', 'en'] as const;
export type TLanguage = string;

export interface IAppConfig {
  lastOpenedProjectPath?: string
  defaultIconColor?: string
  sideBarWidth?: number
  language?: TLanguage
}
