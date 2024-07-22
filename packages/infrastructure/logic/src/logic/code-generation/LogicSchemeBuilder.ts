import { FrontRootStore, IDirectory, IFileSystemService } from '@falang/frontend-core';
import { IconStore, SchemeStore } from "@falang/editor-scheme";
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
import { ArrUnshiftBlockStore } from '../blocks/arrays/arr_unshift/ArrUnshift.block.store';
import { CallFunctionBlockStore } from "../blocks/call-function/CallFunction.block.store";
import { ExpressionBlockStore } from "../blocks/expression/Expression.block.store";
import { ForeachHeaderBlockStore } from "../blocks/foreach-header/ForeachHeader.block.store";
import { FromToCycleHeaderBlockStore } from "../blocks/from-to-cycle-header/FromToCycleHeader.block.store";
import { FunctionHeaderBlockStore } from "../blocks/function-header/FunctionHeader.block.store";
import { SwitchThreadHeaderBlockStore } from "../blocks/switch-thread-header/SwitchThreadHeader.block.store";
import { TContext, TTypeInfo } from "../constants";
import { ExpressionStore } from "../expression/Expression.store";
import { Expression2Store } from "../expression/Expression2.store";
import { LogicProjectStore } from "../LogicProject.store";
import { ILogicIconsBuilders } from "./interfaces";
import { getCycleCompileInfo, ICycleCompileInfoResult } from './util/getCycleCompileInfo';

export interface ILogicSchemeBuilderParams<TBuilders extends ILogicIconsBuilders = ILogicIconsBuilders> {
  scheme: SchemeStore
  project: LogicProjectStore
  iconBuilders: any
  indexPath: string;
}

export abstract class LogicSchemeBuilder<TBuilders extends ILogicIconsBuilders = ILogicIconsBuilders> {
  readonly scheme: SchemeStore;
  readonly project: LogicProjectStore;
  private structure: IDirectory | null = null;
  readonly iconBuilders: TBuilders;
  codeBuilder = new CodeBuilder();
  private stackBuilders: CodeBuilder[] = [];
  readonly path: string;
  readonly indexPath: string;
  readonly frontRoot: FrontRootStore;
  readonly fs: IFileSystemService;
  readonly hasApi: boolean;
  readonly cycleCompileInfo: ICycleCompileInfoResult;

  constructor(params: ILogicSchemeBuilderParams<TBuilders>) {
    this.scheme = params.scheme;
    this.project = params.project;
    this.iconBuilders = params.iconBuilders;
    this.path = params.scheme.documentPath;
    this.frontRoot = this.scheme.frontRoot;
    this.fs = this.frontRoot.fs;
    this.indexPath = params.indexPath;
    this.hasApi = params.project.availableApis.length > 0;
    this.cycleCompileInfo = getCycleCompileInfo(params.scheme);
  }

  stackBuilder() {
    this.stackBuilders.push(this.codeBuilder);
    this.codeBuilder = new CodeBuilder();
  }

  unstackBuilder() {
    const lastBuilder = this.stackBuilders.pop();
    if(!lastBuilder) {
      throw new Error('stackBuilders is empty');
    }
    lastBuilder.appendBuilder(this.codeBuilder);
    this.codeBuilder = lastBuilder;
  }

  get lastStackBuilder(): CodeBuilder {
    if(!this.stackBuilders.length) {
      throw new Error('stackBuilders is empty');
    };
    return this.stackBuilders[this.stackBuilders.length - 1];
  }

  abstract build(): Promise<string>;

  async getStructure(): Promise<IDirectory> {
    if (this.structure) {
      return this.structure;
    }
    const structure = await this.frontRoot.getProjectStructure();
    this.structure = structure;
    return structure;
  }

  async getSchemesRootPath(): Promise<string> {
    return (await this.getStructure()).path;
  }

  protected writeSystemInfo(action: string, alias: string, iconId: string) {
    this.writeInlineComment(`f:${action}${":"}${alias}${":"}${iconId}`);
  }

  async generateIcon(icon: IconStore) {
    const errors = icon.block.errors;
    if(errors.length) {
      throw new Error(`Icon #${icon.id} has errors:\n${errors.join('\n')}`);
    }
    this.writeSystemInfo('+icon', icon.alias, icon.id);
    switch (icon.alias) {
      case 'create_var':
        await this.iconBuilders.create_var({
          builder: this,
          block: icon.block as ExpressionBlockStore,
          icon: icon as ActionIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'assign_var':
        await this.iconBuilders.assign_var({
          builder: this,
          block: icon.block as ExpressionBlockStore,
          icon: icon as ActionIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'function':
        await this.iconBuilders.function({
          builder: this,
          block: icon.block as FunctionHeaderBlockStore,
          icon: icon as FunctionIconStore,
          header: (icon as FunctionIconStore).header.block as TextBlockStore,
          cb: this.codeBuilder,
        });
        break;
      case 'if':
        await this.iconBuilders.if({
          builder: this,
          block: icon.block as ExpressionBlockStore,
          icon: icon as IfIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'foreach':
        await this.iconBuilders.foreach({
          builder: this,
          block: icon.block as ForeachHeaderBlockStore,
          icon: icon as ForEachIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'from_to_cycle':
        await this.iconBuilders.from_to_cycle({
          builder: this,
          block: icon.block as FromToCycleHeaderBlockStore,
          icon: icon as ForEachIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'while':
        await this.iconBuilders.while({
          builder: this,
          block: icon.block as ExpressionBlockStore,
          icon: icon as WhileStore,
          cb: this.codeBuilder,
        });
        break;
      case 'pseudo-cycle':
        await this.iconBuilders['pseudo-cycle']({
          builder: this,
          block: icon.block,
          icon: icon as PseudoCycleIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'parallel':
        await this.iconBuilders.parallel({
          builder: this,
          block: icon.block,
          icon: icon as ParallelIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'switch':
        await this.iconBuilders.switch({
          builder: this,
          block: icon.block as ExpressionBlockStore,
          icon: icon as SwitchStore,
          cb: this.codeBuilder,
          options: (icon as SwitchStore).threads.icons.map((icon) => {
            return {
              head: icon.block as SwitchThreadHeaderBlockStore,
              skewer: icon.skewer,
            };
          }),
        });
        break;
      case 'call_function':
        await this.iconBuilders.call_function({
          builder: this,
          block: icon.block as CallFunctionBlockStore,
          icon: icon as ActionIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'call_api':
        await this.iconBuilders.call_api({
          builder: this,
          block: icon.block as CallFunctionBlockStore,
          icon: icon as ActionIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'enums':
        await this.iconBuilders.enums({
          builder: this,
          block: icon.block as TextBlockStore,
          icon: icon as MindTreeRootIconStore,
          enums: (icon as MindTreeRootIconStore).threads.icons.map((thread) => ({
            head: thread.block as EnumHeadBlockStore,
            items: thread.skewer.icons.map((child) => child.block as EnumItemBlockStore)
          })),
          cb: this.codeBuilder,
        });
        break;
      case 'logic_external_apis':
        await this.iconBuilders.logic_external_apis({
          builder: this,
          block: icon.block as TextBlockStore,
          icon: icon as MindTreeRootIconStore,
          apis: (icon as MindTreeRootIconStore).threads.icons.map((thread) => ({
            head: thread.block as LogicExternalApiHeadBlockStore,
            items: thread.skewer.icons.map((child) => child.block as FunctionHeaderBlockStore)
          })),
          cb: this.codeBuilder,
        });
        break;
      case 'logic_objects':
        await this.iconBuilders.logic_objects({
          builder: this,
          block: icon.block as TextBlockStore,
          icon: icon as MindTreeRootIconStore,
          objects: (icon as MindTreeRootIconStore).threads.icons.map((thread) => ({
            head: thread.block as LogicObjectNameBlockStore,
            items: thread.skewer.icons.map((child) => child.block as ObjectDefinitionBlockStore),
          })),
          cb: this.codeBuilder,
        });
        break;
      case 'log':
        await this.iconBuilders.log({
          builder: this,
          block: icon.block as ExpressionBlockStore,
          icon: icon as OutputIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'tree':
        switch(icon.scheme.documentType) {
          case 'object_definition':
            await this.iconBuilders.logic_objects({
              builder: this,
              block: icon.block as TextBlockStore,
              icon: icon as MindTreeRootIconStore,
              objects: (icon as MindTreeRootIconStore).threads.icons.map((thread) => ({
                head: thread.block as LogicObjectNameBlockStore,
                items: thread.skewer.icons.map((child) => child.block as ObjectDefinitionBlockStore),
              })),
              cb: this.codeBuilder,
            });
            break;
          default:      
            throw new Error(`Wrong document type for icon: ${icon.alias}, ${icon.scheme.documentType}`);
        }
        break;
      case 'arr_pop':
        await this.iconBuilders.arr_pop({
          builder: this,
          block: icon.block as ArrPopBlockStore,
          icon: icon as MindTreeRootIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'arr_push':
        await this.iconBuilders.arr_push({
          builder: this,
          block: icon.block as ArrPushBlockStore,
          icon: icon as MindTreeRootIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'arr_shift':
        await this.iconBuilders.arr_shift({
          builder: this,
          block: icon.block as ArrShiftBlockStore,
          icon: icon as MindTreeRootIconStore,
          cb: this.codeBuilder,
        });
        break;
      case 'arr_unshift':
        await this.iconBuilders.arr_unshift({
          builder: this,
          block: icon.block as ArrUnshiftBlockStore,
          icon: icon as MindTreeRootIconStore,
          cb: this.codeBuilder,
        });
        break;
      default:      
        throw new Error(`Wrong icon: ${icon.alias}`);
    }
    this.writeSystemInfo('-icon', icon.alias, icon.id);
  }

  /**
   * @deprecated
   */
  abstract generateExpressionOld(expression: ExpressionStore, resultType: TTypeInfo, context: TContext): Promise<string>;
  abstract generateExpression(expression: Expression2Store, resultType: TTypeInfo, context: TContext): Promise<string>;
  abstract generateEmptyValue(type: TTypeInfo): Promise<string>;
  abstract printBigComment(comment: string): void;

  writeInlineComment(comment: string) {
    this.codeBuilder.inlineComment(comment);
  }

  async generateSkewer(skewer: SkewerStore) {
    for (const icon of skewer.icons) {
      try {
        await this.generateIcon(icon);
      } catch (err) {
        console.log(this.codeBuilder.get());
        throw err;
      }
    }
  }

  async getSchemeRelativePathArray(path: string): Promise<string[]> {
    return this.project.getSchemeRelativePathArray(path);
  }
}
