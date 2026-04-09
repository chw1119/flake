const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveMemos: (memos) => ipcRenderer.invoke('save-memos', memos),
  loadMemos: () => ipcRenderer.invoke('load-memos'),
  exportMemo: (memo, format) => ipcRenderer.invoke('export-memo', { memo, format }),

  // Window controls
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // Claude Code integration
  claudeCheck: () => ipcRenderer.invoke('claude-check'),
  claudeSend: (message, memoContext) => ipcRenderer.invoke('claude-send', { message, memoContext }),
  claudeStop: () => ipcRenderer.invoke('claude-stop'),
  onClaudeStream: (callback) => ipcRenderer.on('claude-stream', (_, chunk) => callback(chunk)),

  // Script execution
  runScript: (code, blockId) => ipcRenderer.invoke('run-script', { code, blockId }),
  stopScript: (blockId) => ipcRenderer.invoke('stop-script', blockId),
  onScriptOutput: (callback) => ipcRenderer.on('script-output', (_, data) => callback(data)),

  // Events from main process
  onNewMemo: (callback) => ipcRenderer.on('new-memo', callback),
  onDataFileChanged: (callback) => ipcRenderer.on('data-file-changed', callback),
});
