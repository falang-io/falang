import { IEnumTypeInfo, TTypeInfo } from "../../constants";
import { IStructureTypeItem } from "../../ILogicProjectType";
import { LogicProjectStore } from "../../LogicProject.store";
import { IAvailableEnumItem } from "../../util/loadAvailableEnums";

export interface IGetFullTypeNameParams {
  type: TTypeInfo | null
  project: LogicProjectStore,
  importStruct: (structItem: IStructureTypeItem) => Promise<void> 
  importEnum: (enumItem: IAvailableEnumItem) => Promise<void>
}

export const getFullTypeName = async ({
  type,
  project,
  importEnum,
  importStruct,
}: IGetFullTypeNameParams): Promise<string> => {
  if (!type) throw new Error('Type is null');
  switch (type.type) {
    case 'struct':
      const structItem = project.getStruct(type.iconId, type.schemeId);
      if (!structItem) throw new Error(``);
      await importStruct(structItem);
      return structItem.name;
    case 'array':
      const arrayItemType = type.elementType;
      const fullElementTypeName = await getFullTypeName({
        type: arrayItemType,
        project,
        importStruct,
        importEnum,
      });
      return fullElementTypeName.concat("[]".repeat(type.dimensions));
    case 'boolean':
    case 'number':
    case 'string':
    case 'void':
      return type.type;
    case 'enum':
      const enumItem = project.getEnum(type.iconId, type.schemeId);
      if (!enumItem) throw new Error(``);
      await importEnum(enumItem);
      return enumItem.name;
  }
  throw new Error(`Wrong type: ${type.type}`);
}