export const LogicExportLanguages = ['ts', 'js', 'cpp', 'golang', 'rust', 'sharp'] as const;
export type TExportLanguage = (typeof LogicExportLanguages)[number];

export interface ILogicExportConfigurationItem {
  readonly language: TExportLanguage;
  readonly path: string;
}

export interface ILogicExportConfiguration {
  readonly exports: readonly ILogicExportConfigurationItem[];
}
