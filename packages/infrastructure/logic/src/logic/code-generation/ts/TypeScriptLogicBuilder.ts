import { IDirectory, IFile } from '@falang/frontend-core';
import { ISchemeDto } from '@falang/editor-scheme';
import { SchemeStore } from '@falang/editor-scheme';
import { LogicBuilder } from "../LogicBuilder";
import { LogicEnumInfrastructureType } from "../../../logic_enum/LogicEnumInfrastructureType";
import { LogicObjectsInfrastructureType } from "../../../logic_objects/LogicObjectsInfrastructureType";
import { LogicExternalApiInfrastructureType } from "../../../logic_external_api/LogicExternalApinfrastructureType";
import { LogicInfrastructureType } from "../../LogicInfrastructureType";
import { TypescriptLogicSchemeBuilder } from "./TypescriptLogicSchemeBuilder";
import { typescriptLogicIconsBuilder } from "./typescriptLogicIconsBuilder";
import { runInAction } from "mobx";
import { CodeBuilder } from '@falang/editor-scheme';
import { IAvailableFunctionItem } from "../../util/loadAvailableFunctions";
import { ExpressionFunctionsNames, expressionFunctions } from "../../constants";
import { getFullTypeName } from "./getFullTypeName";
import { getInfrastructureTypeByFile } from "../util/getInfrastrucureType";

export class TypescriptLogicBuilder extends LogicBuilder<any> {
  async build(): Promise<void> {
    const rootDir = await this.project.frontRoot.getProjectStructure();
    await this.buildDirectory(rootDir);
    await this.buildGlobal();
  }

  private async buildDirectory(directory: IDirectory) {
    for(const file of directory.files) {
      await this.buildFile(file);
    }
    for(const dir of directory.directories) {
      await this.buildDirectory(dir);
    }
  }

  private async buildFile(file: IFile) {
    const fs = this.project.frontRoot.fs;
    const relativePath = await fs.relativePath(this.projectPath, file.path);
    const newFilePath = (await fs.resolvePath(this.outpuPath, relativePath)).replace('.falang.json', '.ts');
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
    const schemeBuilder = new TypescriptLogicSchemeBuilder({
      iconBuilders: typescriptLogicIconsBuilder,
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
    const pathToFalangFile = await fs.resolvePath(this.outpuPath, '_falang.ts');
    const rootPath = await this.getSchemesRootPath();

    const apiImports = new Set<string>;
    const b = new CodeBuilder();
    const availableApis = this.project.availableApis.slice();
    const groupedApis = new Map<string, IGroupedApis>();
    availableApis.forEach((apiData) => {
      const current = groupedApis.get(apiData.schemeId);
      if(!current) {
        groupedApis.set(apiData.schemeId, {
          schemeId: apiData.schemeId,
          schemeName: apiData.schemeName ?? '',
          apis: [apiData],
          name: apiData.name,
        });
      } else {
        current.apis.push(apiData);
      }
    });
    if (groupedApis.size) {
      b.p('export interface Apis {');
      b.plus();
      for(const value of groupedApis.values()) {
        const apiFilePath = value.apis[0].path;
        const relativePathToApi = await fs.relativePath(rootPath, apiFilePath.replace('.falang.json', ''));
        const importNames = value.apis.map((apiItem) => apiItem.name);
        apiImports.add(`import { ${value.apis[0].schemeName} } from '${relativePathToApi}';`);
        b.p(`${value.schemeName}: ${value.schemeName}`);
      }
      b.closeQuote();
    }
    b.p('export interface FalangGlobal {');
    b.indentPlus();
    if(groupedApis.size) {
      b.p('apis: Apis;');
    }

    b.closeQuote();

    const fb = new CodeBuilder();
    fb.bigComment([
      'Generated by Falang',
      'Global functions',
    ]);
    b.pp(Array.from(apiImports));
    fb.appendBuilder(b);
    /**
     * IExpressionFunctions builder
     */
    const eb = new CodeBuilder();
    eb.p('export interface IExpressionFunctions {');
    eb.indentPlus();
    for(const functionName of ExpressionFunctionsNames) {
      const expressionFunction = expressionFunctions[functionName];
      for(const signature of expressionFunction.signatures) {
        const paramsStrings: string[] = [];
        for (let i = 0; i < signature.parameters.length; i++) {
          const parameterType = await getFullTypeName({
            type: signature.parameters[i],
            importEnum: async () => { throw new Error('Should not import enum here') },
            importStruct: async () => { throw new Error('Should not import struct here') },
            project: this.project,
          });
          paramsStrings.push(`p${i}: ${parameterType}`);
        }
        const returnParameterType = await getFullTypeName({
          type: signature.returnType,
          importEnum: async () => { throw new Error('Should not import enum here') },
          importStruct: async () => { throw new Error('Should not import struct here') },
          project: this.project,
        });
        eb.p(`${functionName}(${paramsStrings.join(', ')}): ${returnParameterType};`);
      }
    }
    eb.closeQuote();
    eb.p('');
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