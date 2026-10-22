import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('saveApi', {
  write: (slot: string, data: string) => ipcRenderer.invoke('save:write', slot, data) as Promise<boolean>,
  read: (slot: string) => ipcRenderer.invoke('save:read', slot) as Promise<string | null>,
  remove: (slot: string) => ipcRenderer.invoke('save:delete', slot) as Promise<boolean>,
});
