import { FrontRootStore, IDirectory } from '@falang/frontend-core'
import { MindTreeRootIconDto } from '@falang/editor-scheme'
import { FunctionHeaderBlockDto } from '../blocks/function-header/FunctionHeader.block.dto'
import { IAvailableFunctionItem } from './loadAvailableFunctions'
import { LogicExternalApiHeadBlockDto } from '../../logic_external_api/blocks/logic_external_api_head/LogicExternalApiHead.block.dto';

export const loadAvailableApis = async (frontRoot: FrontRootStore, dir: IDirectory): Promise<IAvailableFunctionItem[]> => {
  const returnValue = await loadAvailableApisInternal(frontRoot, dir);
  returnValue.sort((a, b) => a.name.localeCompare(b.name));
  return returnValue;
}

const loadAvailableApisInternal = async (frontRoot: FrontRootStore, dir: IDirectory): Promise<IAvailableFunctionItem[]> => {
  const returnValue: IAvailableFunctionItem[] = [];
  for (const childDir of dir.directories) {
    returnValue.push(...await loadAvailableApisInternal(frontRoot, childDir));
  }
  for (const file of dir.files) {
    if(file.type !== 'logic_external_apis') continue;
    const dto = JSON.parse(await frontRoot.loadFile(file.path)).root as MindTreeRootIconDto;
    for(const threadIconDto of dto.children) {
      for(const functionIconDto of threadIconDto.children) {
        const block = functionIconDto.block as FunctionHeaderBlockDto
        returnValue.push({
          schemeId: dto.id,
          iconId: functionIconDto.id,
          schemeName: file.name,
          apiClassName: (threadIconDto.block as LogicExternalApiHeadBlockDto).name,
          name: block.name,
          path: file.path,
          parameters: block.parameters,
          returnValue: block.returnValue,
        });
      }
    }
  }
  return returnValue;
}
