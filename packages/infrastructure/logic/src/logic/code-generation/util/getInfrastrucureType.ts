import { IFile } from '@falang/frontend-core';
import { InfrastructureType } from "@falang/editor-scheme";
import { LogicEnumInfrastructureType } from "../../../logic_enum/LogicEnumInfrastructureType";
import { LogicExternalApiInfrastructureType } from "../../../logic_external_api/LogicExternalApinfrastructureType";
import { LogicObjectsInfrastructureType } from "../../../logic_objects/LogicObjectsInfrastructureType";
import { LogicInfrastructureType } from "../../LogicInfrastructureType";

export const getInfrastructureTypeByFile = (file: IFile): InfrastructureType | null => {
  let infrastructure: InfrastructureType;
  switch (file.type) {
    case 'logic_enum':
      infrastructure = new LogicEnumInfrastructureType();
      break;
    case 'object_definition':
      infrastructure = new LogicObjectsInfrastructureType();
      break;
    case 'logic_external_apis':
      infrastructure = new LogicExternalApiInfrastructureType();
      break;
    case 'function':
      infrastructure = new LogicInfrastructureType();
      break;
    default:
      return null;
  }
  return infrastructure;
}