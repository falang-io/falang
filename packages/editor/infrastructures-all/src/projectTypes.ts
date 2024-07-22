import { CodeProjectType } from '@falang/infrastructure-code';
import { LogicProjectType } from '@falang/infrastructure-logic';
import { ProjectType } from '@falang/editor-scheme';
import { TextProjectType } from '@falang/infrastructure-text';
import { TProjectTypeName } from './projectNames';

export type TProjectTypes = Record<TProjectTypeName, ProjectType>;

export const projectTypes: TProjectTypes = {
  text: new TextProjectType,
  console_cpp: new CodeProjectType('console_cpp'),
  console_js: new CodeProjectType('console_js'),
  console_php: new CodeProjectType('console_php'),
  console_rust: new CodeProjectType('console_rust'),
  console_ts: new CodeProjectType('console_ts'),
  logic: new LogicProjectType(),
}


export const getDocumentConfig = (projectTypeName: TProjectTypeName, documentTypeName: string) => {
  const projectType = projectTypes[projectTypeName];
  if (!projectType) {
    throw new Error(`Wrong project type: ${projectTypeName}`);
  }
  const documentType = projectType.config.documentsConfig.find((doc) => doc.name === documentTypeName);
  if(!documentType) {
    throw new Error(`Wong document type: ${projectTypeName}/${documentTypeName}`);
  }
  return documentType;
}