const { app, BrowserWindow, globalShortcut, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const FLAKE_DIR = path.join(os.homedir(), '.flake');
const DATA_FILE = path.join(FLAKE_DIR, 'data.json');

// Ensure ~/.flake exists
if (!fs.existsSync(FLAKE_DIR)) {
  fs.mkdirSync(FLAKE_DIR, { recursive: true });
}

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

  tray.setToolTip('Flake');
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

ipcMain.handle('save-memos', async (event, memos) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(memos, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-memos', async () => {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return { success: true, memos: [] };
    }
    const data = fs.readFileSync(DATA_FILE, 'utf-8');
    return { success: true, memos: JSON.parse(data) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('export-memo', async (event, { memo, format }) => {
  try {
    const ext = format === 'txt' ? 'txt' : 'json';
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '메모 내보내기',
      defaultPath: path.join(app.getPath('documents'), `flake-${Date.now()}.${ext}`),
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
