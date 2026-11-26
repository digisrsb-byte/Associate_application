/**
 * Minimal preload — no Node APIs exposed to page content of the hosted app.
 * Only a tiny bridge for local setup/offline pages.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('associateDesktop', {
  getShellInfo: () => ipcRenderer.invoke('desktop:get-shell-info'),
  retryLoad: () => ipcRenderer.invoke('desktop:retry-load'),
  openExternal: (url) => ipcRenderer.invoke('desktop:open-external', url),
});
