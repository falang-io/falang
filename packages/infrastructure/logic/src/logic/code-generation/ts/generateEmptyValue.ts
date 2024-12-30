import { ProjectStore } from '@falang/editor-scheme';
import { TTypeInfo } from '../../constants';
import { LogicProjectStore } from '../../LogicProject.store';

export const generateEmptyValue = async (type: TTypeInfo, project: LogicProjectStore): Promise<string> => {
  switch (type.type) {
    case 'number':
      return '0';
    case 'string':
      return '\'\'';
    case 'boolean':
      return 'false';
    case 'struct': {
      const returnArr: string[] = [];
      const structType = project.getStructByType(type);
      if(!structType) return '';
      for(const propertyName in structType.properties) {
        returnArr.push(`${propertyName}:${await generateEmptyValue(structType.properties[propertyName], project)}`)
      }
      return `{${returnArr.join(',')}}`;
    }
    case 'array': return '[]';
    default:
      throw new Error(`Wrong type for generateEmptyValue: ${type.type}`);
  }
}