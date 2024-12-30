import { makeObservable } from 'mobx';
import { LogicProjectStore } from './LogicProject.store';

import type vfsLib from "@typescript/vfs"
import type ts from "typescript"
import { DiagnosticCategory, DiagnosticMessageChain } from 'typescript';
import { add } from 'mathjs';

export class LogicTsCodeStore {
  private _ts: typeof ts | null = null;
  private _vfsLib: typeof vfsLib | null = null;
  private readonly fsMap = new Map<string, string>();
  private _env: vfsLib.VirtualTypeScriptEnvironment | null = null;

  constructor(
    private readonly projectStore: LogicProjectStore,
  ) {
    makeObservable(this);
    this.loadLibraries();
  }

  get loaded() {
    return !!this._ts && !!this._vfsLib;
  }

  get ts() {
    if (this._ts === null) throw new Error('ts not loaded');
    return this._ts;
  }

  get vfs() {
    if (this._vfsLib === null) throw new Error('vfs not loaded');
    return this._vfsLib;
  }

  get env() {
    if (this._env === null) throw new Error('env not loaded');
    return this._env;
  }

  updateFile(schemeId: string, id: string, contents: string) {
    const fileName = this.getFileName(schemeId, id);
    if (this.fsMap.has(fileName)) {
      this.env.updateFile(fileName, contents);
    } else {
      this.env.createFile(fileName, contents);
      this.updateIndexFile();
    }
  }

  getErrors(schemeId: string, id: string): string[] {
    const fileName = this.getFileName(schemeId, id);
    const file = this.env.getSourceFile(fileName);
    if (!file) throw new Error(`File ${fileName} not found in virtual environment`);
    const semanticDiagnostics = this.env.languageService.getSemanticDiagnostics(fileName);
    const syntacticDiagnostics = this.env.languageService.getSyntacticDiagnostics(fileName);
    const returnValue: string[] = [];
    semanticDiagnostics.forEach(d => {
      if(d.category === DiagnosticCategory.Error) {
        addErrors(returnValue, d.messageText);
      }
    });
    syntacticDiagnostics.forEach(d => {
      if(d.category === DiagnosticCategory.Error) {
        addErrors(returnValue, d.messageText);
      }
    })
    return returnValue;
  }

  deleteFile(schemeId: string, id: string) {
    const fileName = this.getFileName(schemeId, id);
    this.env.deleteFile(fileName);
    this.updateIndexFile();
  }

  getFileName(schemeId: string, id: string) {
    return `${schemeId}/${id}.ts`;
  }

  private updateIndexFile() {
    const strings: string[] = [];
    for (const fileName of this.fsMap.keys()) {
      if (fileName === 'index.ts') continue;
      strings.push(`import './${fileName}';`);
    }
    strings.push('export {};');
    this.env.updateFile('index.ts', strings.join('\n'));
  }

  private loadLibraries() {
    Promise.all([
      import('typescript'),
      import('@typescript/vfs'),
    ]).then(([ts, vfs]) => {
      this._ts = ts;
      this._vfsLib = vfs;
      this.afterLibrariesLoaded();
    });
  }

  async waitForLibrariesLoaded() {
    let tries = 0;
    while (!this._env && tries < 1000) {
      tries++;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (!this._env) throw new Error('Typesciprt environment not loaded');
  }

  private afterLibrariesLoaded() {
    this.fsMap.set("index.ts", 'const a = "Hello World";');
    const system = this.vfs.createSystem(this.fsMap);
    const compilerOpts = {};
    this._env = this.vfs.createVirtualTypeScriptEnvironment(system, ["index.ts"], this.ts, compilerOpts);
  }

  dispose() {
    for (const fileName in this.fsMap.entries()) {
      this.env.deleteFile(fileName);
    }
  }
}

const addErrors = (errors: string[], message: string | DiagnosticMessageChain) => {
  if(typeof message === 'string') {
    errors.push(message);
    return;
  }
  if (message.category !== DiagnosticCategory.Error) return;
  addErrors(errors, message.messageText);
}