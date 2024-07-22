import { TProjectType } from './project';

export type TDocumentVisibility = 'private' | 'protected' | 'link' | 'public';

export const SchemeIcons = [
  'function',
  'object',
] as const;

export type TSchemeIcon = typeof SchemeIcons[number];

export interface ISchemeJson {
  id: string
  name: string
  description: string
  root: any
  projectTemplate: TProjectType
  schemeTemplate: string
  icon: TSchemeIcon
  latestVersionHash?: string
  visibility?: TDocumentVisibility
}