import { AiOutlineFunction } from 'react-icons/ai';
import { ProjectType } from '@falang/editor-scheme';
import { FaRegObjectGroup } from 'react-icons/fa'
import { SchemeStore } from '@falang/editor-scheme';
import { ProjectStore } from '@falang/editor-scheme';
import { FrontRootStore } from '@falang/frontend-core';
import { VscSymbolEnum } from "react-icons/vsc";
import { MdDataObject } from "react-icons/md";
import { AiOutlineApi } from "react-icons/ai";
import { ILogicProjectType, IStructureTypeItem } from './logic/ILogicProjectType';
import { LogicProjectStore } from './logic/LogicProject.store';

export class LogicProjectType extends ProjectType implements ILogicProjectType {
  readonly isLogicProjectType = true;
  constructor() {
    super({
      documentsConfig: [{
        infrastructure: 'logic',
        name: 'function',
        createEmpty: (scheme) => {
          return scheme.createEmptyIcon('function', null);
        },
        icon: AiOutlineFunction,
      }, {
        infrastructure: 'logic_object',
        name: 'object_definition',
        createEmpty: (scheme) => {
          return scheme.createEmptyIcon('tree', null);
        },
        icon: MdDataObject,
      }/*, {
        infrastructure: 'logic_enum',
        name: 'logic_enum',
        createEmpty: (scheme) => {
          return scheme.createEmptyIcon('enums', null);
        },
        icon: VscSymbolEnum,
      }*/, {
        infrastructure: 'logic_external_apis',
        name: 'logic_external_apis',
        createEmpty: (scheme) => {
          return scheme.createEmptyIcon('logic_external_apis', null);
        },
        icon: AiOutlineApi,
      }],
      name: 'logic',
      sideBarEditor: null
    });
  }

  /**
   * @deprecated
   */
  async getAvailableStructures(scheme: SchemeStore): Promise<IStructureTypeItem[]> {
    return [];
  }

  createProjectStore(frontRoot: FrontRootStore): ProjectStore | null {
    return new LogicProjectStore(frontRoot);
  }

  
}