import { IDirectory, IFileSystemService } from '@falang/frontend-core';
import { LogicProjectStore } from "../LogicProject.store";
import { ILogicIconsBuilders } from "./interfaces";

export interface ILogicBuilderParams<TBuilders extends ILogicIconsBuilders = ILogicIconsBuilders> {
  project: LogicProjectStore
  iconBuilders: TBuilders
  indexPath: string;
  outpuPath: string;
  projectPath: string;
} {
  
}

export abstract class LogicBuilder<TBuilders extends ILogicIconsBuilders = ILogicIconsBuilders> {
  fs: IFileSystemService
  project: LogicProjectStore
  iconBuilders: TBuilders
  indexPath: string;
  outpuPath: string;
  projectPath: string;
  protected hasApi = false;
  private  structure: IDirectory | null = null;

  constructor(params: ILogicBuilderParams<TBuilders>) {
    this.project = params.project;
    this.hasApi = this.project.availableApis.length > 0;
    this.iconBuilders = params.iconBuilders;
    this.indexPath = params.indexPath;
    this.outpuPath = params.outpuPath;
    this.projectPath = params.projectPath;
    this.fs = params.project.frontRoot.fs;
  }

  async getStructure(): Promise<IDirectory> {
    if (this.structure) {
      return this.structure;
    }
    const structure = await this.project.frontRoot.getProjectStructure();
    this.structure = structure;
    return structure;
  }

  async getSchemesRootPath(): Promise<string> {
    return (await this.getStructure()).path;
  }

  async prepare() {
    
  }

  abstract build(): Promise<void>;  
}