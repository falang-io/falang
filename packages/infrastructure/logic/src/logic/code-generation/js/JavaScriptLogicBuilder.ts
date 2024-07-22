import { IDirectory, IFile } from '@falang/frontend-core';
import { ISchemeDto } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { LogicBuilder, ILogicBuilderParams } from "../LogicBuilder";
import { LogicEnumInfrastructureType } from "../../../logic_enum/LogicEnumInfrastructureType";
import { LogicObjectsInfrastructureType } from "../../../logic_objects/LogicObjectsInfrastructureType";
import { LogicExternalApiInfrastructureType } from "../../../logic_external_api/LogicExternalApinfrastructureType";
import { LogicInfrastructureType } from "../../LogicInfrastructureType";
import { JavascriptLogicSchemeBuilder } from "./JavascriptLogicSchemeBuilder";
import { javascriptLogicIconsBuilder } from "./javascriptLogicIconsBuilder";
import { runInAction } from "mobx";
import { CodeBuilder } from '@falang/editor-scheme';
import { IAvailableFunctionItem } from "../../util/loadAvailableFunctions";
import { ExpressionFunctionsNames, expressionFunctions } from "../../constants";
import { getFullTypeName } from "./getFullTypeName";
import { getInfrastructureTypeByFile } from "../util/getInfrastrucureType";

export interface IJavascriptLogicBuilderParams extends ILogicBuilderParams<any> {
  singleFile?: boolean
}

export class JavascriptLogicBuilder extends LogicBuilder<any> {
  readonly singleFileBuilder?: CodeBuilder;

  constructor(params: IJavascriptLogicBuilderParams) {
    super(params);
    if(params.singleFile) {
      this.singleFileBuilder = new CodeBuilder()
    }
  }

  async build(): Promise<void> {
    const rootDir = await this.project.frontRoot.getProjectStructure();
    if(this.singleFileBuilder) {
      const sb = this.singleFileBuilder;
      sb.p('"use strict";');
      sb.p('(() => {');
      sb.plus();
      sb.p('const _falangRegistry = {};');
    }
    await this.buildDirectory(rootDir);
    await this.buildGlobal();
    if(this.singleFileBuilder) {
      const sb = this.singleFileBuilder;
      sb.p('return _falangRegistry;');
      sb.minus();
      sb.p('})();');
      const pathToFalangFile = await this.fs.resolvePath(this.outpuPath, '_falang.js');
      this.fs.saveFile(pathToFalangFile, sb.get());
    }
  }

  private async buildDirectory(directory: IDirectory) {
    for (const file of directory.files) {
      await this.buildFile(file);
    }
    for (const dir of directory.directories) {
      await this.buildDirectory(dir);
    }
  }

  private async buildFile(file: IFile) {
    const fs = this.project.frontRoot.fs;
    const relativePath = await fs.relativePath(this.projectPath, file.path);
    const newFilePath = (await fs.resolvePath(this.outpuPath, relativePath)).replace('.falang.json', '.js');
    const fileDir = await fs.dirname(newFilePath);
    if(!this.singleFileBuilder) {
      if (!(await fs.fileExists(fileDir))) {
        await fs.createDirectory(fileDir);
      }
    }
    const contents = await this.project.frontRoot.loadFile(file.path);
    const doc: ISchemeDto = JSON.parse(contents);
    const infrastructure = getInfrastructureTypeByFile(file);
    if (!infrastructure) {
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
    const schemeBuilder = new JavascriptLogicSchemeBuilder({
      iconBuilders: javascriptLogicIconsBuilder,
      indexPath: this.indexPath,
      project: this.project,
      singleFile: !!this.singleFileBuilder,
      scheme,
    });
    const code = await schemeBuilder.build();
    scheme.dispose();
    if(this.singleFileBuilder) {
      const fb = new CodeBuilder();
      const pathArry = await this.project.getSchemeRelativePathArray(schemeBuilder.path);
      fb.p(`_falangRegistry['${pathArry.join('/')}'] = (() => {`);
      fb.plus();
      fb.p('const exports = {};');
      fb.print(code);
      fb.p('return exports;');
      fb.minus();
      fb.p('})();');
      this.singleFileBuilder.appendBuilder(fb);
    } else {
      await fs.saveFile(newFilePath, code);
    }    
  }

  private async buildGlobal() {
    const fs = this.project.frontRoot.fs;
    const pathToFalangFile = await fs.resolvePath(this.outpuPath, '_falang.js');
    const rootPath = await this.getSchemesRootPath();

    const imports: string[] = [];
    const b = new CodeBuilder();
    const availableApis = this.project.availableApis.slice();
    const groupedApis = new Map<string, IGroupedApis>();
    availableApis.forEach((apiData) => {
      const current = groupedApis.get(apiData.schemeId);
      if (!current) {
        groupedApis.set(apiData.schemeId, {
          schemeId: apiData.schemeId,
          schemeName: apiData.name ?? '',
          apis: [apiData]
        });
      } else {
        current.apis.push(apiData);
      }
    });
    b.p('/**');
    b.p(' * @typedef FalangGlobal');
    for (const value of groupedApis.values()) {
      const apiFilePath = value.apis[0].path;
      const relativePathToApi = await fs.relativePath(rootPath, apiFilePath.replace('.falang.json', ''));
      const importNames = value.apis.map((apiItem) => apiItem.name);
      //imports.push(`import { ${importNames.join(', ')} } from '${relativePathToApi}';`);
      b.p(`${value.schemeName}: {`);
      b.indentPlus();
      for (const apiItem of value.apis) {
        b.p(`${apiItem.name}: ${apiItem.name},`);
      }
      b.indentMinus();
      b.p('},');
    }
    b.p(' */');
    const fb = new CodeBuilder();
    if(this.singleFileBuilder) {
      fb.p(
        '_falangRegistry[\'_falang\'] = (() => {',
      );
      fb.plus();
      fb.p(
        'const exports = {};'
      );
    }
    fb.bigComment([
      'Generated by Falang',
      'Global functions',
    ]);
    fb.appendBuilder(b);
  }
}

interface IGroupedApis {
  apis: IAvailableFunctionItem[]
  schemeId: string
  schemeName: string
}
