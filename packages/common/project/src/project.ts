import { TCodeLanguage } from './code';

export const PROJECT_CONFIG_VERSION = 1;

export const ProjectTypeNames = [
  "text",
  "sequence",
  "console_ts",
  "console_js",
  "console_rust",
  "console_cpp",
  "console_php"
] as const;

export type TProjectType = typeof ProjectTypeNames[number];

export interface IProjectConfig {
  version: number
  name: string
  mainSchemeName: string
  codeLanguage?: TCodeLanguage
  type: TProjectType
  defaultIconBackground?: string
  schemeBackground?: string
}