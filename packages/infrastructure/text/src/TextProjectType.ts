import { ProjectType } from '@falang/editor-scheme';
import {AiOutlineProject, AiOutlineFunction} from 'react-icons/ai';
import { MdDataObject } from 'react-icons/md';
import type { ProjectStore } from '@falang/editor-scheme';
import { FrontRootStore } from '@falang/frontend-core';
import { TextProjectStore } from './TextProject.store';

export class TextProjectType extends ProjectType {
  constructor(infrastructureName = 'text') {
    super({
      documentsConfig: [{
        infrastructure: infrastructureName,
        name: 'function',
        createEmpty: (scheme) => {
          return scheme.createEmptyIcon('function', null);
        },
        icon: AiOutlineFunction,
      },{
        infrastructure: infrastructureName,
        name: 'lifegram',
        createEmpty: (scheme) => {
          return scheme.createEmptyIcon('lifegram', null);
        },
        icon: AiOutlineProject,
      }, {
        infrastructure: infrastructureName,
        name: 'tree',
        createEmpty: (scheme) => {
          return scheme.createEmptyIcon('tree', null);
        },
        icon: MdDataObject,
      }],
      name: infrastructureName,
      sideBarEditor: null,
      editableIconColor: true,
    });
  }

  createProjectStore(frontRoot: FrontRootStore): ProjectStore | null {
    return new TextProjectStore(frontRoot);
  }
}