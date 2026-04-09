const { app, BrowserWindow, globalShortcut, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 500,
    minHeight: 400,
    frame: false,
    transparent: false,
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: '열기', click: () => mainWindow && mainWindow.show() },
    { label: '새 메모', click: () => mainWindow && mainWindow.webContents.send('new-memo') },
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Memo App');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow && mainWindow.show());
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Alt+N', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus();
      } else {
        mainWindow.show();
      }
      mainWindow.webContents.send('new-memo');
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerShortcuts();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

ipcMain.handle('save-memo', async (event, { memo, filePath }) => {
  try {
    let savePath = filePath;
    if (!savePath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: '메모 저장',
        defaultPath: path.join(app.getPath('documents'), `memo-${Date.now()}.json`),
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });
      if (result.canceled) return { success: false, canceled: true };
      savePath = result.filePath;
    }
    fs.writeFileSync(savePath, JSON.stringify(memo, null, 2), 'utf-8');
    return { success: true, filePath: savePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-memo', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '메모 열기',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled) return { success: false, canceled: true };
    const data = fs.readFileSync(result.filePaths[0], 'utf-8');
    return { success: true, memo: JSON.parse(data), filePath: result.filePaths[0] };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-memo', async (event, { memo, format }) => {
  try {
    const ext = format === 'txt' ? 'txt' : 'json';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '메모 내보내기',
      defaultPath: path.join(app.getPath('documents'), `memo-${Date.now()}.${ext}`),
      filters: [{ name: `${ext.toUpperCase()} Files`, extensions: [ext] }]
    });
    if (result.canceled) return { success: false, canceled: true };

    let content;
    if (format === 'txt') {
      content = memo.title + '\n\n' + memo.content.replace(/<[^>]*>/g, '');
    } else {
      content = JSON.stringify(memo, null, 2);
    }
    fs.writeFileSync(result.filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());
