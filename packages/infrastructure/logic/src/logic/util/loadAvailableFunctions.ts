import { FrontRootStore, IDirectory } from '@falang/frontend-core'
import { FunctionIconDto } from '@falang/editor-scheme'
import { FunctionHeaderBlockDto, FunctionHeaderParameterDto } from '../blocks/function-header/FunctionHeader.block.dto'
import { TVariableInfo } from '../constants'

export interface IAvailableFunctionItem {
  name: string
  schemeId: string
  schemeName?: string
  apiClassName?: string
  iconId?: string | null
  path: string
  parameters: FunctionHeaderParameterDto[]
  returnValue: TVariableInfo
}

export const loadAvailableFunctions = async (frontRoot: FrontRootStore, dir: IDirectory): Promise<IAvailableFunctionItem[]> => {
  const returnValue = await loadAvailableFunctionsInternal(frontRoot, dir);
  returnValue.sort((a, b) => a.name.localeCompare(b.name));
  return returnValue;
}

const loadAvailableFunctionsInternal = async (frontRoot: FrontRootStore, dir: IDirectory): Promise<IAvailableFunctionItem[]> => {
  const returnValue: IAvailableFunctionItem[] = [];
  for (const childDir of dir.directories) {
    returnValue.push(...await loadAvailableFunctionsInternal(frontRoot, childDir));
  }
  for (const file of dir.files) {
    if(file.type !== 'function') continue;
    const dto = JSON.parse(await frontRoot.loadFile(file.path)).root as FunctionIconDto;
    const id = file.id;
    const block = dto.block as FunctionHeaderBlockDto
    returnValue.push({
      schemeId: dto.id,
      name: file.name,
      path: file.path,
      parameters: block.parameters,
      returnValue: block.returnValue,
    });
  }
  return returnValue;
};
