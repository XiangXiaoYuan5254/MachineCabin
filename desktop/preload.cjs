const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('machineCabin', {
  retry: () => ipcRenderer.send('console:retry'),
});
