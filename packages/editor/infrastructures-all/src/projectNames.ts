import React from 'react';
import { IconType } from 'react-icons';

export const ProjectTypesNames = [
  'text', 
  'logic',
  'console_ts',
  'console_rust',
  'console_cpp',
  'console_php',
  'console_js',
] as const;

export interface IExtraProject {
  name: string
  path: string
}

export const extraProjects: { examples: IExtraProject[], tests: IExtraProject[] } = {
  examples: [{
    path: 'test-projects/MonteCarlo',
    name: 'Calculate PI MonteCarlo'
  }],
  tests: [{
    path: 'test-projects/api',
    name: 'External API'
  },{
    path: 'test-projects/arrays',
    name: 'Arrays'
  },{
    path: 'test-projects/conditions',
    name: 'Cycles'
  },{
    path: 'test-projects/objects',
    name: 'Objects'
  },],
}

export type TProjectTypeName = typeof ProjectTypesNames[number];
export type TDocumentIcon = IconType;

export const isProjectTypeName = (t: any): t is TProjectTypeName => ProjectTypesNames.includes(t);