import { LangState } from './i18n/LangState';
import { OverlayToaster, Toaster } from "@blueprintjs/core";
import { IContextMenuItem, IContextMenuService } from './IContextMenuService';
import { IMessageBoxService } from './IMessageBoxService';
import { ILinksService } from './ILinksService';
import { IDirectory } from './ProjectStructure';
import { IFileSystemService } from './IFileSystem.service';

export interface IDomRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

type TGetDomRectById = (id: string) => IDomRect;

interface FrontRootStoreParams {
  contextMenu: IContextMenuService;
  getDomRectById: TGetDomRectById;
  messageBox: IMessageBoxService;
  clipboard: IClipboardService;
  links: ILinksService;
  getProjectStructure: () => Promise<IDirectory>
  loadFile: (path: string) => Promise<string>
  fs: IFileSystemService
  setProjectMenu?: (menu: IContextMenuItem[]) => Promise<void>
  getRootPath: () => Promise<string>
  lang?: LangState
}

export interface IClipboardService {
  getValue(): Promise<string | null>;
  setValue(value: string): Promise<void>;
}

export class FrontRootStore {
  readonly lang: LangState;
  readonly toaster = globalThis.document ? OverlayToaster.create(): {
    show: () => "",
    clear: () => {},
    dismiss: () => {},
    getToasts: () => [],
  } as Toaster;
  readonly contextMenu: IContextMenuService;
  readonly getDomRectById: TGetDomRectById;
  readonly messageBox: IMessageBoxService
  readonly clipboard: IClipboardService;
  readonly links: ILinksService;
  readonly getRootPath: () => Promise<string>;
  readonly getProjectStructure: () => Promise<IDirectory>
  readonly loadFile: (path: string) => Promise<string>
  readonly fs: IFileSystemService
  readonly setProjectMenu: (menu: IContextMenuItem[]) => Promise<void>

  constructor({
    contextMenu,
    getDomRectById,
    messageBox,
    clipboard,
    links,
    getProjectStructure,
    loadFile,
    fs,
    setProjectMenu,
    getRootPath,
    lang
  }: FrontRootStoreParams) {
    this.contextMenu = contextMenu;
    this.getDomRectById = getDomRectById;
    this.messageBox = messageBox;
    this.clipboard = clipboard;
    this.links = links;
    this.getProjectStructure = getProjectStructure;
    this.loadFile = loadFile;
    this.fs = fs;
    this.getRootPath = getRootPath;
    this.setProjectMenu = setProjectMenu ?? (() => Promise.resolve());
    this.lang = lang ?? new LangState();
  }
}