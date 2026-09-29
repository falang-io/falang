import type { INode } from '@falang/dto';
import type { Scheme } from '../../scheme/scheme.js';
import type { IIconComponent } from '../../types/toolbar-icon.js';

export interface IProjectDirectory {
  id: string;
  name: string;
  children: IProjectDirectory[];
  documents: IProjectDocument[];
}

export interface IProject {
  id: string;
  type: string;
  name: string;
  path?: string;
}

export interface IProjectDocument {
  id: string;
  name: string;
  data: INode | null;
}

export interface ISchemeDocumentType {
  name: string;
  schemeFactory: () => Scheme;
  root: string;
  icon?: IIconComponent;
}

export interface IProjectConfig {
  documents: ISchemeDocumentType[];
}
