import { IEnumTypeInfo, TTypeInfo } from "../../constants";
import { IStructureTypeItem } from "../../ILogicProjectType";
import { LogicProjectStore } from "../../LogicProject.store";
import { IAvailableEnumItem } from "../../util/loadAvailableEnums";
import { floatConverter, intConverter } from "./convertSymbol";

export interface IGetFullTypeNameParams {
  type: TTypeInfo | null
  project: LogicProjectStore,
  importStruct: (structItem: IStructureTypeItem) => Promise<boolean>
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
      const imported = await importStruct(structItem);
      if(imported) {
        return `${structItem.schemeName}.${structItem.name}`;
      } else {
        return `${structItem.name}`;
      }
    case 'array':
      const arrayItemType = type.elementType;
      const fullElementTypeName = await getFullTypeName({
        type: arrayItemType,
        project,
        importStruct,
        importEnum,
      });
      return `[]${fullElementTypeName}`;
    case 'boolean':
      return 'bool';
    case 'number':
      switch (type.numberType) {
        case 'float': return floatConverter[type.floatType];
        case 'integer': return intConverter[type.integerType];
        //case 'decimal': return 'decimal';
        case 'any': return 'anyNumber';
        default: throw new Error(`Wrong type: ${JSON.stringify(type)}`);
      }
    case 'string':
      return 'string';
    case 'void':
      return '';
    case 'enum': {
      const enumItem = project.getEnum(type.iconId, type.schemeId);
      if (!enumItem) throw new Error(``);
      await importEnum(enumItem);
      return enumItem.name;
    };
  }
  throw new Error(`Wrong type: ${type.type}`);
}

/**    if (!type) throw new Error('Type is null');
    switch (type.type) {
      case 'struct':
        const structItem = this.project.getStruct(type.iconId, type.schemeId);
        if (!structItem) throw new Error(``);
        await this.importStruct(structItem);
        return structItem.name;
      case 'array':
        const arrayItemType = type.elementType;
        const fullElementTypeName = await this.getFullTypeName(arrayItemType);
        return `Vec<${fullElementTypeName}>`;
      case 'boolean':
        return 'Boolean';
      case 'number':
        switch(type.numberType) {
          case 'float': return 'f32';
          case 'integer': return 'i32';
          case 'decimal': return 'Decimal';
          default: throw new Error(`Wrong type: ${JSON.stringify(type)}`);
        }
      case 'string':
        return 'String';
      case 'void':
        return '';
      case 'enum':
        const enumItem = this.project.getEnum(type.iconId, type.schemeId);
        if (!enumItem) throw new Error(``);
        await this.importEnum(enumItem);
        return enumItem.name;
    }
    throw new Error(`Wrong type: ${type.type}`); */
