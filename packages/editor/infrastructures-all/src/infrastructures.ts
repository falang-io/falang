import { InfrastructureType } from '@falang/editor-scheme';
import { LogicInfrastructureType, LogicObjectsInfrastructureType, LogicEnumInfrastructureType, LogicExternalApiInfrastructureType } from '@falang/infrastructure-logic';
import { TextInfrastructureType } from '@falang/infrastructure-text'; 
import { CodeInfrastructureType } from '@falang/infrastructure-code';

export const InfrastructureNames = [
  'text',
  'console_ts',
  'console_rust',
  'console_cpp',
  'console_php',
  'console_js',
  'logic',
  'logic_object',
  'logic_enum',  
  'logic_external_apis',
] as const;
export type TInfrastructureName = typeof InfrastructureNames[number];

export type TInfrastructuresConfig = Record<TInfrastructureName, InfrastructureType>

export const infrastructures = {
  text: new TextInfrastructureType(),
  console_cpp: new CodeInfrastructureType('cpp', 'c', 'console_cpp'),
  console_js: new CodeInfrastructureType('js', 'js', 'console_js'),
  console_php: new CodeInfrastructureType('php', 'php', 'console_php'),
  console_rust: new CodeInfrastructureType('rust', 'rust', 'console_rust'),
  console_ts: new CodeInfrastructureType('ts', 'ts', 'console_ts'),
  logic: new LogicInfrastructureType(),
  logic_object: new LogicObjectsInfrastructureType(),
  logic_enum: new LogicEnumInfrastructureType(),
  logic_external_apis: new LogicExternalApiInfrastructureType(),
} as const satisfies TInfrastructuresConfig;