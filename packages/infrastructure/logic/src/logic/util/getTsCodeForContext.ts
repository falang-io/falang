import { CodeBuilder } from '@falang/editor-scheme';
import { generateEmptyValue } from '../code-generation/ts/generateEmptyValue';
import { getFullTypeName } from '../code-generation/ts/getFullTypeName';
import { TContext } from '../constants';
import { IStructureTypeItem } from '../ILogicProjectType';
import { LogicProjectStore } from '../LogicProject.store';

interface IGetTsCodeForContextResponse {
  code: string
  lines: number
}

export const getTsCodeForContext = async (context: TContext, project: LogicProjectStore): Promise<IGetTsCodeForContextResponse> => {
  const b = new CodeBuilder();
  const structures: IStructureTypeItem[] = [];
  const importStruct: (structItem: IStructureTypeItem) => Promise<void> = async (structItem) => {
    structures.push(structItem);
  }
  const importEnum = async () => { console.error('Enums not working in getTsCodeForContext'); };
  for(let varName in context) {
    const varType = context[varName];
    const fullTypeName = await getFullTypeName({
      type: varType,
      importEnum,
      importStruct,
      project,
    });
    const emptyValue = await generateEmptyValue(varType, project);
    b.p(`let ${varName}: ${fullTypeName} = ${emptyValue};`);
  }
  const alreadyImported = new Set<string>();
  let added = 1;
  while(added > 0) {
    added = 0;
    for (const structure of structures) {
      if(alreadyImported.has(structure.iconId)) continue;
      b.p(`interface ${structure.name} {`);
      b.plus();
      for (const p in structure.properties) {
        const item = structure.properties[p];
        b.p(`${p}: ${await getFullTypeName({
          type: item,
          importEnum,
          importStruct,
          project,
        })};`);
      }
      b.closeQuote();
      added++;
      alreadyImported.add(structure.iconId);
    }
  }
  b.p(`export {};`);
  return {
    code: b.get(),
    lines: b.linesCount,
  };
}
