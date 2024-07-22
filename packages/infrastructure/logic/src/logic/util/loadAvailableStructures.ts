import { FrontRootStore, IDirectory } from '@falang/frontend-core';
import { IconWithSkewerDto } from '@falang/editor-scheme';
import { MindTreeRootIconDto } from '@falang/editor-scheme';
import { ObjectDefinitionBlockDto } from '../../logic_objects/blocks/definition/ObjectDefinition.block.dto';
import { TextBlockDto } from '@falang/infrastructure-text';
import { TObjectProperties } from '../constants';
import { IStructureTypeItem } from '../ILogicProjectType';

export const loadAvailableStructures = async (frontRoot: FrontRootStore, dir: IDirectory): Promise<IStructureTypeItem[]> => {
  const returnValue = await loadAvailableStructuresInternal(frontRoot, dir);
  returnValue.sort((a, b) => a.name.localeCompare(b.name));;
  return returnValue;
};

const loadAvailableStructuresInternal = async (frontRoot: FrontRootStore, dir: IDirectory): Promise<IStructureTypeItem[]> => {
  const returnValue: IStructureTypeItem[] = [];
  for (const childDir of dir.directories) {
    returnValue.push(...await loadAvailableStructuresInternal(frontRoot, childDir));
  }
  for (const file of dir.files) {
    if(file.type !== 'object_definition') continue;
    const dto = JSON.parse(await frontRoot.loadFile(file.path)).root as MindTreeRootIconDto;
    const id = file.id;
    for (const child of dto.children) {
      const blockDto = child.block as TextBlockDto;
      const text = blockDto.text;
      if (!text) continue;
      const properties: TObjectProperties = {};
      for (const propertyIcon of (child as IconWithSkewerDto).children) {
        const propertyBlock = propertyIcon.block as ObjectDefinitionBlockDto;
        if (!propertyBlock.variableType) continue;
        properties[propertyBlock.name] = propertyBlock.variableType;
      }
      returnValue.push({
        iconId: child.id,
        name: text,
        path: file.path,
        properties,
        schemeId: id,
        schemeName: file.name.replace('.falang.json', ''),
      });
    }
  }
  return returnValue;;
};
