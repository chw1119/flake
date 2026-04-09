const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveMemo: (memo, filePath) => ipcRenderer.invoke('save-memo', { memo, filePath }),
  loadMemo: () => ipcRenderer.invoke('load-memo'),
  exportMemo: (memo, format) => ipcRenderer.invoke('export-memo', { memo, format }),

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Events from main process
  onNewMemo: (callback) => ipcRenderer.on('new-memo', callback),
});
