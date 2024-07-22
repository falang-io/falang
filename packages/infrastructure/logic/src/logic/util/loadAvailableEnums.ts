import { FrontRootStore, IDirectory } from '@falang/frontend-core'
import { IconWithSkewerDto } from '@falang/editor-scheme';
import { MindTreeRootIconDto } from '@falang/editor-scheme';
import { EnumHeadBlockDto } from '../../logic_enum/blocks/enum_head/EnumHead.block.dto'
import {EnumItemBlockDto} from '../../logic_enum/blocks/enum_item/EnumItem.block.dto';
import { TEnumTypeVariant } from '../constants';

export interface IAvailableEnumItemOption {
  key: string
  value: string | number
}

export interface IAvailableEnumItem {
  name: string
  schemeId: string
  iconId: string
  path: string
  schemeName: string
  type: TEnumTypeVariant
  options: IAvailableEnumItemOption[]
}

export const loadAvailableEnums = async (frontRoot: FrontRootStore, dir: IDirectory): Promise<IAvailableEnumItem[]> => {
  const returnValue = await loadAvailableEnumsInternal(frontRoot, dir);
  returnValue.sort((a, b) => a.name.localeCompare(b.name));
  return returnValue;
}

const loadAvailableEnumsInternal = async (frontRoot: FrontRootStore, dir: IDirectory): Promise<IAvailableEnumItem[]> => {
  const returnValue: IAvailableEnumItem[] = [];
  for (const childDir of dir.directories) {
    returnValue.push(...await loadAvailableEnumsInternal(frontRoot, childDir));
  }
  for (const file of dir.files) {
    if(file.type !== 'logic_enum') continue;
    const dto = JSON.parse(await frontRoot.loadFile(file.path)).root as MindTreeRootIconDto;
    dto.children.map((childDto: IconWithSkewerDto) => {
      const childBlock =  childDto.block as EnumHeadBlockDto
      returnValue.push({
        schemeId: dto.id,
        name: childBlock.name,
        type: childBlock.valueType,
        path: file.path,
        iconId: childDto.id,
        schemeName: file.name.replace('.falang.json', ''),
        options: childDto.children.map((dto) => {
          const blockOptionDto = dto.block as EnumItemBlockDto;
          return {
            key: blockOptionDto.key,
            value: String(blockOptionDto.value),
          };
        })
      });
    })

  }  
  return returnValue;
}