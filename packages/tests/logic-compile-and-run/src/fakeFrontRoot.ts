import { FrontRootStore, IFileSystemService } from '@falang/frontend-core';
import { FileSystemService } from '@falang/back-fs';
import * as path from 'path';

let projectRoot = '';

export const setProjectRoot = (newProjectRoot: string) => {
  projectRoot = newProjectRoot;
};

export const getSchemesRoot = () => {
  return path.join(projectRoot, 'falang/schemas');
}

export const fs = new FileSystemService;

export const fakeFrontRoot = new FrontRootStore({
  contextMenu: {
    showMenu: () => {},
  },
  getDomRectById: () => ({
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
  }),
  messageBox: {
    show: async () => null,
  },
  fs: new FileSystemService,
  clipboard: {
    getValue: async () => '',
    setValue: async () => {},
  },
  getProjectStructure: async () => {
    return await fs.loadDirectory(getSchemesRoot());
  },
  getRootPath: async () => projectRoot,
  links: {
    getLinkInfo: fs.getLinkInfo,
    getLinksOptions: fs.getLinksOptions,
    linkClicked: async (id: string) => {
    },
  },
  loadFile: async (path: string) => {
    return fs.loadFile(path);
  },
});