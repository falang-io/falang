import { makeObservable, observable, runInAction } from 'mobx';
import { TabStore } from './Tab.store';
import { ISchemeDto, SchemeStore } from '@falang/editor-scheme';
import { TDocumentIcon } from '@falang/infrastructures-all';
import { IdeFileStore } from '../IdeDirectories.store';
import { IdeStore } from '../../Ide.store';
import { FrontRootStore } from '@falang/frontend-core'
import { IDocumentDto } from '../../document/dto/Document.dto';

export class ProjectSchemeEditorTabStore extends TabStore {
  public readonly scheme: SchemeStore;

  constructor(
    ide: IdeStore,
    scheme: SchemeStore,
    path: string
  ) {
    super(ide, "scheme");
    this.path = path;
    this.scheme = scheme;
    /*this.projectTemplate = file.projectTemplate;
    this.schemeTemplate = file.schemeTemplate;
    this.icon = file.icon;
    this.name = file.name;
    this.path = file.path;
    const projectTypeName = document.projectType;
    const documentTypeName = document.documentType;
    const projectType = projectTypes[projectTypeName];
    if (!projectType) throw new Error(`Wrong project type ${projectTypeName}`);
    const documentConfig = projectType.config.documentsConfig.find((item) => item.name === documentTypeName);
    if (!documentConfig) {
      throw new Error(`Wrong document type: ${projectTypeName}/${documentTypeName}`);
    }
    const infrastructure = infrastructures[documentConfig.infrastructure];
    if (!infrastructure) {
      throw new Error(`Wrong infrastructure: ${documentConfig.infrastructure}`);
    }
    this.scheme = new SchemeStore(this.ide.frontRoot, infrastructure);*/
    makeObservable(this);
  }

  getFileContents(): string {
    return JSON.stringify(this.scheme.toDto(), undefined, 2);
  }

  protected getTitle(): string {
    return this.scheme.name;
  }

  dispose(): void {
    this.scheme.dispose();
  }

  goBack(): void {
    this.scheme.history.back();
  }

  goForward(): void {
    this.scheme.history.forward();
  }

  protected getIsModified(): boolean {
    return this.scheme.history.isModified;
  }

  onSave(): void {
    this.scheme.history.onSave();
  }

  getIcon(): TDocumentIcon | null {
    const documentsConfig = this.ide.projectType?.config.documentsConfig;
    if(!documentsConfig) return null;
    const projectType = documentsConfig.find((d) => d.name == this.scheme.documentType);
    if(!projectType) return null;
    return projectType.icon ?? null;
  }
}