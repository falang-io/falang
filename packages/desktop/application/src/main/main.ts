import 'reflect-metadata';
import * as path from 'path'
import * as fs from 'fs';
import { format } from 'url'
import { app, BrowserWindow, MenuItemConstructorOptions, Menu, ipcMain, dialog, clipboard, session } from 'electron'
import { is } from 'electron-util';
import { FILE_EXTENSION } from '../common/constants';
import rimraf from 'rimraf'

import { TLanguage, getLang, langConfig } from '@falang/i18n';
import { IDocumentDto } from '@falang/editor-ide';
import { MainService } from './Main.service';
import { ISchemeDto } from '@falang/editor-scheme';
import { IContextMenuItem, IDirectory, IFile } from '@falang/frontend-core';
import { copyFilesToEmptyProject, myCreateDirectory, myDeleteFile, myFileExists, myIsDirectory, myReadDir, myReadFile, myRename, myWriteFile, resourcesPath } from '@falang/back-fs';
import { readConfig, saveConfig } from './fs';
import { LastProjectsService } from './LastProjects.service';
import electron from 'electron';
import { PROJECT_EXTENSION } from '@falang/editor-ide';

const iconPath = path.resolve(resourcesPath, 'icon.png');
//console.log({ iconPath });
let forceClose = false;
/*
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'base';
    returnNull: false;
    returnEmptyString: false;
    nsSeparator: ':';
    keySeparator: ':';
    jsonFormat: 'v4';
    allowObjectInHTMLChildren: false;
    resources: typeof langConfig;
  }
};
*/

let win: BrowserWindow | null = null;
let contextMenu: Electron.Menu;

async function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 820,
    minHeight: 600,
    minWidth: 650,
    webPreferences: {
      nodeIntegration: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    icon: iconPath,
    show: false,
    title: 'Falang',

  })

  const isDev = is.development

  if (isDev) {
    // this is the default port electron-esbuild is using
    win.loadURL('http://localhost:9080').then(() => {
      initLastProjects();
    })
  } else {
    win.loadURL(
      format({
        pathname: path.join(__dirname, 'index.html'),
        protocol: 'file',
        slashes: true,
      }),
    ).then(() => {
      win?.webContents.focus();
      initLastProjects();
    })
  }

  win.on('closed', () => {
    win = null
  })

  win.webContents.on('devtools-opened', () => {
    win!.focus()
  })

  win.on('ready-to-show', () => {
    win!.show()
    win!.focus()

    if (isDev) {
      win!.webContents.openDevTools({ mode: 'bottom' })
    }
  });

  win.on('close', (e) => {
    if(forceClose) return;
    e.preventDefault();
    onWindowClosed();
  });

  const mainService = new MainService(win);
  const addToHandle = (item: Record<string, any>, prefix = '') => {
    if (typeof item !== 'object') {
      console.error('Wrong item', item);
      throw new Error('Wrong item');
    };
    for (const key in item) {
      if (key === 'prototype' || key === 'win') continue;      
      const child = item[key];
      //console.log(key, item[key], typeof child);
      if (typeof child === 'function') {
        const fullKey = `${prefix}-${key}`;
        console.info('Register main handler', fullKey);
        ipcMain.handle(fullKey, (e, ...args) => item[key](...args))
      } else if (typeof item === 'object') {
        const newPrefix = prefix.length ? `${prefix}-` : '';
        addToHandle(item[key], `${newPrefix}${key}`);
      } else {
        console.warn('Bad item in addToHandle:', {
          obj: item
        });
      }
    }
  }
  addToHandle(mainService);


  ipcMain.handle('show-context-menu', (event, params: MenuItemConstructorOptions[]) => {
    return new Promise((resolve) => {
      let sent = false;
      const attachEvents = (items: MenuItemConstructorOptions[]) => {
        items.forEach((item) => {
          item.click = () => {
            if (sent) return;
            sent = true;
            resolve(item.id);
          }
          if (item.submenu && Array.isArray(item.submenu)) {
            attachEvents(item.submenu);
          }
        });
      }
      attachEvents(params);
      contextMenu = Menu.buildFromTemplate(params);
      contextMenu.on('menu-will-close', (event) => {
        event.preventDefault();
        //win.webContents.focus();
        setTimeout(() => {
          if (!sent) {
            resolve(null);
            sent = true;
          }
        }, 100);
      });
      contextMenu.popup();
    });
  });

  ipcMain.handle('load-directory', async (event, directory: string): Promise<IDirectory> => {
    return loadDirectory(directory);
  });

  ipcMain.handle('load-file', async (event, file: string): Promise<string> => {
    const result = await myReadFile(file);
    if(file.includes(PROJECT_EXTENSION)) {
      lastProjectsService.onOpen(file);
    }
    return result;
  });

  ipcMain.handle('save-file', async (event, { filePath, contents, name }: { contents: string, filePath?: string, name?: string }): Promise<string | null> => {
    let realFilePath: string | null = filePath ?? await saveFileDialog(`${name ?? "NewScheme"}.${FILE_EXTENSION}`)
    if (!realFilePath) return null;
    //const pathToSave = filePath ?? path.resolve(directory, `${name}${FILE_EXTENSION}`);
    await myWriteFile(realFilePath, contents);
    return realFilePath;
  });

  ipcMain.handle('open-file', async (): Promise<IFile[] | null> => {
    return openFile();
  });

  /*ipcMain.handle('save-file-dialog', async (): Promise<string | null> => {
    return saveFileDialog()
  });*/

  ipcMain.handle('open-directory', async (): Promise<string | null> => {
    return openDirectory();
  })

  ipcMain.handle('open-project', async (): Promise<string | null> => {
    const value = await openProject();
    //win.webContents.focus();
    return value;
  });

  ipcMain.handle('resolve-path', (e, args: string[]) => {
    return path.resolve(...args);
  })

  ipcMain.handle('move-file', (e, oldPath: string, newPath: string) => {
    return myRename(oldPath, newPath);
  });

  ipcMain.handle('delete-file', (e, filePath: string) => {
    return myDeleteFile(filePath);
  });

  ipcMain.handle('delete-directory', async (e, directoryPath: string) => {
    const deleted = await rimraf(directoryPath);
    if (!deleted) {
      throw new Error('Can`t delete');
    }
  });

  ipcMain.handle('copy-empty-project', async (e, type: string, path: string) => {
    return copyFilesToEmptyProject(type, path);
  });

  ipcMain.handle('create-directory', (e, directoryPath: string) => {
    return myCreateDirectory(directoryPath);
  });

  ipcMain.handle('get-app-path', (e, pathType: any) => {
    return app.getPath(pathType);
  });

  ipcMain.handle('file-exists', (e, filePath: string) => {
    return myFileExists(filePath);
  });

  ipcMain.handle('write-config', (e, contents: string) => {
    return saveConfig(contents);
  });

  ipcMain.handle('read-config', () => {
    return readConfig();
  });

  ipcMain.handle('set-lang', (e, l: TLanguage) => {
    lang = l;
    buildMenu();
  });

  ipcMain.handle('set-project-menu', (e, m: IContextMenuItem[]) => {
    projectMenu = m;
    buildMenu();
  });

  ipcMain.handle('basename', (e, filePath: string) => {
    return path.basename(filePath);
  });

  ipcMain.handle('dirname', (e, filePath: string) => {
    return path.dirname(filePath);
  });

  ipcMain.handle('relati', (e, filePath: string) => {
    return path.dirname(filePath);
  });

  ipcMain.handle('get-clipboard', () => {
    return clipboard.readText();
  });

  ipcMain.handle('get-version', () => {
    return electron.app.getVersion();
  });

  ipcMain.handle('set-clipboard', (e, value: string) => {
    clipboard.writeText(value);
  });

  ipcMain.handle('close-window', () => {
    forceClose = true;
    win?.close();
  });

  const onWindowClosed = () => {
    win?.webContents.send('on-window-close');
  }

  const openFile = async (): Promise<IFile[] | null> => {
    if(!win) return null;
    const result = await dialog.showOpenDialog(win, {
      filters: [{
        extensions: [FILE_EXTENSION],
        name: 'Falang scheme'
      }],
      properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    const fileInfos: IFile[] = [];
    for (let filePath of result.filePaths) {
      fileInfos.push(await getIdeFileInfo(filePath));
    }
    return fileInfos;
  };

  const saveFileDialog = async (name: string): Promise<string | null> => {
    if(!win) return null;
    const result = await dialog.showSaveDialog(win, {
      filters: [{
        extensions: ['.falang.json'],
        name: 'Falang scheme'
      }],
      defaultPath: path.resolve(app.getPath('home'), name),
    });
    if (result.canceled) return null;
    return result.filePath ?? null;
  }

  const openDirectory = async (defaultValue?: string): Promise<string | null> => {
    if(!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['createDirectory', 'openDirectory'],
      defaultPath: defaultValue,
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    return result.filePaths[0];
  }

  let lang: TLanguage = 'en';
  let projectMenu: IContextMenuItem[] = [];

  const buildMenu = () => {
    //console.log('build menu', lang);
    const { t } = getLang(lang);

    const lastFilesMenu: MenuItemConstructorOptions[] = lastProjectsService.data.map((item) => {
      return {
        label: item.name,
        click: () => {
          win?.webContents.send('on-open-project', path.dirname(item.path));
        }
      }
    });


    const menuTemplate: MenuItemConstructorOptions[] = [{
      label: t('app:file') ?? undefined,
      submenu: [{
        label: t('app:new-project') ?? undefined,
        click: () => {
          win?.webContents.send('on-new-project');
        },
        accelerator: 'CommandOrControl+N',
      }, {
        label: t('app:open-project') ?? undefined,
        click: async () => {
          const projectPath = await openProject();
          if (projectPath === null) return;
          win?.webContents.send('on-open-project', projectPath);
          lastProjectsService.onOpen(path.resolve(projectPath, 'project.falangproject.json'));
        },
        accelerator: 'CommandOrControl+O',
      }, {
        type: 'separator'
      }, {
        label: t('app:save') ?? undefined,
        click: () => {
          win?.webContents.send('on-save');
        },
        accelerator: 'CommandOrControl+S',
      }, {
        label: t('app:project_settings') ?? undefined,
        click: () => {
          win?.webContents.send('project-settings-clicked');
        },
      }, 
        ...projectMenu.map((item) => ({
          ...item,
          label: item.text,
          click: () => {
            win?.webContents.send('on-project-menu-clicked', item.text);
          }
        })),
        ...(lastFilesMenu.length ? [{
          label: t('app:last_opened_projects') ?? undefined,
          submenu: lastFilesMenu,
        }] : []),
      {
        type: 'separator'
      }, {
        label: t('app:quit') ?? undefined,
        click: () => {
          onWindowClosed();
        },
        accelerator: 'CommandOrControl+Q',
      }]
    },{
      label: t('base:edit') ?? undefined,
      submenu: [{
        label: t('app:undo') ?? undefined,
        click: () => {
          win?.webContents.send('on-back');
        },
        accelerator: 'CommandOrControl+Z',
      }, {
        label: t('app:redo') ?? undefined,
        click: async () => {
          win?.webContents.send('on-forward');
        },
        accelerator: 'CommandOrControl+Y',
      }]
    },{
      label: t('base:help') ?? undefined,
      submenu: [{
        label: t('base:docs') ?? undefined,
        click: () => {
          win?.webContents.send('onDocsClicked');
        },
      }, {
        label: t('app:about') ?? undefined,
        click: async () => {
          win?.webContents.send('onAboutClicked');
        },
      }]
    }];

    const menu = Menu.buildFromTemplate(menuTemplate);
    win?.setMenu(menu);
    Menu.setApplicationMenu(menu);
  }


  const lastProjectsService = new LastProjectsService(() => {
    buildMenu();
  });

  const initLastProjects = () => {
    lastProjectsService.init().then(() => {
      const item = lastProjectsService.data[0];
      console.log('item', item);
      if(item) {
        setTimeout(() => {
          win?.webContents.send('on-open-project', path.dirname(item.path));
        }, 1000);
      }
      buildMenu();
    });
  }

  const openProject = async (): Promise<string | null> => {
    if(!win) return null;
    const result = await dialog.showOpenDialog(win, {
      filters: [{
        extensions: ['falangproject.json'],
        name: 'Falang project'
      }],
      properties: ['openFile']
    });
    if (result.canceled || !result.filePaths.length) {
      return null;
    }
    if (!result.filePaths[0].includes('project.falangproject.json')) {
      throw new Error('Wrong project');
    }
    return path.dirname(result.filePaths[0]);
  };

  const getIdeFileInfo = async (filePath: string): Promise<IFile> => {
    const fileName = path.basename(filePath);
    const fileContents = await myReadFile(filePath);
    const fileData = JSON.parse(fileContents) as ISchemeDto;
    return {
      name: fileName.replace(`.${FILE_EXTENSION}`, ''),
      path: filePath,
      type: fileData.type,
      id: fileData.id,
    };
  }

  const loadDirectory = async (directory: string): Promise<IDirectory> => {
    const contents = await myReadDir(directory);
    const returnValue: IDirectory = {
      name: path.basename(directory),
      path: directory,
      directories: [],
      files: [],
    };
    for (const fileName of contents) {
      const filePath = path.join(directory, fileName);
      const isDirectory = await myIsDirectory(filePath);
      if (isDirectory) {
        returnValue.directories.push(await loadDirectory(filePath));
      } else if (fileName.endsWith(FILE_EXTENSION)) {
        const fileInfo = await getIdeFileInfo(filePath);
        returnValue.files.push(fileInfo);
      }
    }
    return returnValue;
  }
}

app.on('ready', createWindow)

app.on('window-all-closed', () => {
  if (!is.macos) {
    app.quit()
  }
})

app.on('activate', () => {
  if (win === null && app.isReady()) {
    createWindow()
  }
});
//console.log(app.getAppPath());

/*
const template: MenuItemConstructorOptions[] = [
  {
    label: 'Edit',
    submenu: [
      {
        label: 'hello'
      },
      {
        role: 'redo'
      },
      {
        type: 'separator'
      },
      {
        role: 'cut'
      },
      {
        role: 'copy'
      },
      {
        role: 'paste'
      }
    ]
  },

  {
    label: 'View',
    submenu: [
      {
        role: 'reload'
      },
      {
        type: 'separator'
      },
      {
        type: 'separator'
      },
      {
        role: 'togglefullscreen'
      }
    ]
  },

  {
    role: 'window',
    submenu: [
      {
        role: 'minimize'
      },
      {
        role: 'close'
      }
    ]
  },

  {
    role: 'help',
    submenu: [
      {
        label: 'Learn More'
      }
    ]
  }
]

const menu = Menu.buildFromTemplate(template)

menu.items.push(new MenuItem({
  label: 'hello',
  visible: true,
}))
*/