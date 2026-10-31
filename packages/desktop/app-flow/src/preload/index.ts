import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type TFlowSplashState } from '../shared/ipc-channels.js';

contextBridge.exposeInMainWorld('flow', {
  getState: (): Promise<TFlowSplashState> => ipcRenderer.invoke(IPC.getBackendState),
  onState: (listener: (state: TFlowSplashState) => void): void => {
    ipcRenderer.on(IPC.backendStatus, (_event, state: TFlowSplashState) => listener(state));
  },
  openDataFolder: (): Promise<void> => ipcRenderer.invoke(IPC.openDataFolder),
  quit: (): Promise<void> => ipcRenderer.invoke(IPC.quit),
});
