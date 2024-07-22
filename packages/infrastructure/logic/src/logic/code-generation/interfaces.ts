import { IconStore } from "@falang/editor-scheme";
import { BlockStore } from '@falang/editor-scheme';
import { SkewerStore } from '@falang/editor-scheme';
import { ActionIconStore } from '@falang/editor-scheme';
import { ForEachIconStore } from '@falang/editor-scheme';
import { FunctionIconStore } from '@falang/editor-scheme';
import { IfIconStore } from '@falang/editor-scheme';
import { MindTreeRootIconStore } from '@falang/editor-scheme';
import { OutputIconStore } from '@falang/editor-scheme';
import { ParallelIconStore } from '@falang/editor-scheme';
import { PseudoCycleIconStore } from '@falang/editor-scheme';
import { SwitchStore } from '@falang/editor-scheme';
import { WhileStore } from '@falang/editor-scheme';
import { CodeBuilder } from '@falang/editor-scheme';
import { EnumHeadBlockStore } from "../../logic_enum/blocks/enum_head/EnumHead.block.store";
import { EnumItemBlockStore } from "../../logic_enum/blocks/enum_item/EnumItem.block.store";
import { LogicExternalApiHeadBlockStore } from "../../logic_external_api/blocks/logic_external_api_head/LogicExternalApiHead.block.store";
import { ObjectDefinitionBlockStore } from "../../logic_objects/blocks/definition/ObjectDefinition.block.store";
import { LogicObjectNameBlockStore } from "../../logic_objects/blocks/object_name/LogicObjectName.block.store";
import { TextBlockStore } from "@falang/infrastructure-text";
import { ArrPopBlockStore } from '../blocks/arrays/arr_pop/ArrPop.block.store';
import { ArrPushBlockStore } from '../blocks/arrays/arr_push/ArrPush.block.store';
import { ArrShiftBlockStore } from '../blocks/arrays/arr_shift/ArrShift.block.store';
import { ArrSpliceBlockStore } from '../blocks/arrays/arr_splice/ArrSplice.block.store';
import { ArrUnshiftBlockStore } from '../blocks/arrays/arr_unshift/ArrUnshift.block.store';
import { CallFunctionBlockStore } from "../blocks/call-function/CallFunction.block.store";
import { ExpressionBlockStore } from "../blocks/expression/Expression.block.store";
import { ForeachHeaderBlockStore } from "../blocks/foreach-header/ForeachHeader.block.store";
import { FromToCycleHeaderBlockStore } from "../blocks/from-to-cycle-header/FromToCycleHeader.block.store";
import { FunctionHeaderBlockStore } from "../blocks/function-header/FunctionHeader.block.store";
import { SwitchThreadHeaderBlockStore } from "../blocks/switch-thread-header/SwitchThreadHeader.block.store";
import { LogicSchemeBuilder } from "./LogicSchemeBuilder";
/*
export const LogicCodeGenerationLanguages = ['ts', 'rust', 'cpp'] as const;
export type TLogicCodeGenerationLanguage = typeof LogicCodeGenerationLanguages[number];

export interface ICodeGenerationConfigItem {
  name: string
  directory: string
  language: TLogicCodeGenerationLanguage
}*/
/*
export interface SchemeBaseBuilder {
  codeBuilder: CodeBuilder;
  scheme: SchemeStore;
  build(scheme: SchemeStore): string
  buildIcon(icon: IconStore): void
  buildList(icon: IIconWithList): void
}*/

export type ILogicIconCodeBuilderParams<
  TSB extends LogicSchemeBuilder,
  TIconStore extends IconStore,
  TBlock extends BlockStore,
  TExtra extends {} = {}
> = {
  builder: TSB,
  icon: TIconStore,
  block: TBlock,
  cb: CodeBuilder,
} & TExtra

export type TLogicIconCodeBuilder<
  TSB extends LogicSchemeBuilder,
  TIconStore extends IconStore,
  TBlock extends BlockStore,
  TExtra extends {} = {},
> = (params: ILogicIconCodeBuilderParams<TSB, TIconStore, TBlock, TExtra>) => Promise<void>

export interface ISwitchIconBuilderOption {
  head: SwitchThreadHeaderBlockStore,
  skewer: SkewerStore,
}

export interface ILogicIconsBuilders<TSB extends LogicSchemeBuilder = LogicSchemeBuilder<any>> {
  create_var: TLogicIconCodeBuilder<TSB, ActionIconStore, ExpressionBlockStore>
  assign_var: TLogicIconCodeBuilder<TSB, ActionIconStore, ExpressionBlockStore>
  function: TLogicIconCodeBuilder<
    TSB, 
    FunctionIconStore,
    FunctionHeaderBlockStore,
    {
      header: TextBlockStore,
    }>
  if: TLogicIconCodeBuilder<TSB, IfIconStore, ExpressionBlockStore>
  foreach: TLogicIconCodeBuilder<TSB, ForEachIconStore, ForeachHeaderBlockStore>
  from_to_cycle: TLogicIconCodeBuilder<TSB, ForEachIconStore, FromToCycleHeaderBlockStore>
  while: TLogicIconCodeBuilder<TSB, WhileStore, ExpressionBlockStore>
  'pseudo-cycle': TLogicIconCodeBuilder<TSB, PseudoCycleIconStore, BlockStore>
  parallel: TLogicIconCodeBuilder<TSB, ParallelIconStore, BlockStore>
  switch: TLogicIconCodeBuilder<TSB, SwitchStore, ExpressionBlockStore, {
    options: Array<ISwitchIconBuilderOption>
  }>
  call_function: TLogicIconCodeBuilder<TSB, ActionIconStore, CallFunctionBlockStore>
  call_api: TLogicIconCodeBuilder<TSB, ActionIconStore, CallFunctionBlockStore>
  enums: TLogicIconCodeBuilder<TSB, MindTreeRootIconStore, TextBlockStore, {
    enums: Array<{
      head: EnumHeadBlockStore,
      items: Array<EnumItemBlockStore>,
    }>,
  }>
  logic_external_apis: TLogicIconCodeBuilder<TSB, MindTreeRootIconStore, TextBlockStore, {
    apis: Array<{
      head: LogicExternalApiHeadBlockStore,
      items: Array<FunctionHeaderBlockStore>,
    }>,
  }>
  logic_objects: TLogicIconCodeBuilder<TSB, MindTreeRootIconStore, TextBlockStore, {
    objects: Array<{
      head: LogicObjectNameBlockStore,
      items: Array<ObjectDefinitionBlockStore>,
    }>,
  }>,
  log: TLogicIconCodeBuilder<TSB, OutputIconStore, ExpressionBlockStore>,
  arr_pop: TLogicIconCodeBuilder<TSB, ActionIconStore, ArrPopBlockStore>,
  arr_push: TLogicIconCodeBuilder<TSB, ActionIconStore, ArrPushBlockStore>,
  arr_shift: TLogicIconCodeBuilder<TSB, ActionIconStore, ArrShiftBlockStore>,
  arr_splice: TLogicIconCodeBuilder<TSB, ActionIconStore, ArrSpliceBlockStore>,
  arr_unshift: TLogicIconCodeBuilder<TSB, ActionIconStore, ArrUnshiftBlockStore>,
}

export interface BuilderExtraInformation {

}

