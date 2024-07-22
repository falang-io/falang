import { IDirectory, IFile } from '@falang/frontend-core';
import { ISchemeDto } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { LogicBuilder } from "../LogicBuilder";
import { RustLogicSchemeBuilder } from "./RustLogicSchemeBuilder";
import { rustLogicIconsBuilder } from "./rustLogicIconsBuilder";
import { runInAction } from "mobx";
import { CodeBuilder } from '@falang/editor-scheme';
import { IAvailableFunctionItem } from "../../util/loadAvailableFunctions";
import { ExpressionFunctionsNames, expressionFunctions } from "../../constants";
import { getFullTypeName } from "./getFullTypeName";
import { getInfrastructureTypeByFile } from "../util/getInfrastrucureType";
import { getWhileConfig } from '@falang/editor-scheme';

export class RustLogicBuilder extends LogicBuilder<any> {

  async build(): Promise<void> {
    const rootDir = await this.project.frontRoot.getProjectStructure();
    await this.buildDirectory(rootDir, true);
    await this.buildGlobal();
  }

  private async buildDirectory(directory: IDirectory, isRoot = false) {
    const modb = new CodeBuilder();
    if(isRoot && this.project.availableApis.length) {
      modb.p('pub mod falang_global;'); 
    }
    for(const file of directory.files) {
      await this.buildFile(file);
      if(file.type === 'logic_external_apis') {
        continue;
      }
      modb.p('#[allow(non_snake_case)]');
      modb.p(`pub mod ${file.name};`);
    }
    for(const dir of directory.directories) {
      await this.buildDirectory(dir);
      modb.p('#[allow(non_snake_case)]');
      modb.p(`pub mod ${dir.name};`);
    }
    const relativePath = await this.fs.relativePath(this.projectPath, directory.path);
    const newDir = await this.fs.resolvePath(this.outpuPath, relativePath);    
    const modFilePath = await this.project.frontRoot.fs.resolvePath(newDir, 'mod.rs');
    await this.fs.saveFile(modFilePath, modb.get());
  }

  private async buildFile(file: IFile) {
    if(file.type === 'logic_external_apis') {
      return;
    }
    const fs = this.project.frontRoot.fs;
    const relativePath = await fs.relativePath(this.projectPath, file.path);
    const newFilePath = (await fs.resolvePath(this.outpuPath, relativePath)).replace('.falang.json', '.rs');
    const fileDir = await fs.dirname(newFilePath);
    if(!(await fs.fileExists(fileDir))) {
      await fs.createDirectory(fileDir);
    }
    const contents = await this.project.frontRoot.loadFile(file.path);
    const doc: ISchemeDto = JSON.parse(contents);
    const infrastructure = getInfrastructureTypeByFile(file);
    if(!infrastructure) {
      console.error(`Wrong file type: ${file.type} (${file.path})`);
      return;
    }
    const scheme = new SchemeStore(
      this.project.frontRoot,
      infrastructure,
      file.type,
      this.projectPath,
      file.path,
      this.project,
    );
    const icon = scheme.createIconFromDto(doc.root, null);
    runInAction(() => {
      scheme.setRoot(icon);
      scheme.sheduleCallback.flush();
      scheme.name = doc.name
      scheme.description = doc.description;
      scheme.id = doc.id;
    });
    const schemeBuilder = new RustLogicSchemeBuilder({
      iconBuilders: rustLogicIconsBuilder,
      indexPath: this.indexPath,
      project: this.project,
      scheme,
    });
    const code = await schemeBuilder.build();
    scheme.dispose();
    await fs.saveFile(newFilePath, code);
  }

  private async buildGlobal() {
    const fs = this.project.frontRoot.fs;
    const pathToFalangFile = await fs.resolvePath(this.outpuPath, 'falang_global.rs');
    const rootPath = await this.getSchemesRootPath();
    const b = new CodeBuilder();
    b.p('#[allow(non_snake_case)]');
    const availableApis = this.project.availableApis.slice();
    if(!availableApis.length) {
      return;
    }
    if(availableApis.length) {
      b.p(`pub trait Apis {`);
      b.indentPlus();
      b.p('');
      for(const apiData of availableApis) {
        const apiFilePath = apiData.path;
        const relativePathToApi = (await fs.relativePath(rootPath, apiFilePath.replace('.falang.json', ''))).split(/[\/\\]/).filter(item => item !== '.');
        const functionName = apiData.name;
        const paramsStrings: string[] = [];
        for(const p of apiData.parameters) {
          const amp = (p.type.type === 'struct' || p.type.type === 'array') ? '&' : '';
          const typeName = await getFullTypeName({
            project: this.project,
            type: p.type,
          });
          paramsStrings.push(`${p.name}: ${amp}${typeName}`);
        }
        const returnTypeName = await getFullTypeName({
          project: this.project,
          type: apiData.returnValue,
        });
        const functionFullName = `${relativePathToApi.join('_')}_${apiData.apiClassName}_${apiData.name}`;
        const functionPrefix = `fn ${functionFullName}(&mut self`;
        const functionPostfix = `) -> ${returnTypeName};`;
        if(apiData.parameters.length) {
          b.p(functionPrefix.concat(','));
          b.plus();
          for(const ps of paramsStrings) {
            b.p(`${ps},`);
          }
          b.minus();
          b.p(functionPostfix);
        } else {
          b.p(`${functionPrefix}${functionPostfix}`);
        }
        b.p('');
      }
      b.indentMinus();
      b.p('}');
    }

    const fb = new CodeBuilder();
    fb.bigComment([
      'Generated by Falang',
      'Global functions',
    ]);
    fb.appendBuilder(b);
    /**
     * IExpressionFunctions builder
     */
    const eb = new CodeBuilder();
    fb.appendBuilder(eb);
    await fs.saveFile(pathToFalangFile, fb.get());
  }
}

interface IGroupedApis {
  apis: IAvailableFunctionItem[]
  schemeId: string
  schemeName: string
  name: string
}


interface FunciontDataItem {
  name: string
  parameters: string[]
  returnValue: string
}