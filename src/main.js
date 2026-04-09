const { app, BrowserWindow, globalShortcut, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');

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

// Watch ~/.flake/data.json for external changes (e.g. Python SDK)
let lastWriteTime = 0;
let lastExternalMtime = 0;

function watchDataFile() {
  // Ensure file exists before watching
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
  }
  lastExternalMtime = fs.statSync(DATA_FILE).mtimeMs;

  // Poll every 500ms — reliable for rapid external writes
  setInterval(() => {
    try {
      const stat = fs.statSync(DATA_FILE);
      if (stat.mtimeMs > lastExternalMtime) {
        lastExternalMtime = stat.mtimeMs;
        // Ignore our own writes
        if (Date.now() - lastWriteTime < 400) return;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('data-file-changed');
        }
      }
    } catch (e) { /* file may be mid-write */ }
  }, 500);
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  registerShortcuts();
  watchDataFile();
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
    lastWriteTime = Date.now();
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

// Claude Code integration
let claudeProcess = null;

ipcMain.handle('claude-check', async () => {
  return new Promise((resolve) => {
    const proc = spawn('claude', ['--version'], { shell: true });
    let output = '';
    proc.stdout.on('data', (d) => output += d.toString());
    proc.on('close', (code) => {
      resolve({ available: code === 0, version: output.trim() });
    });
    proc.on('error', () => resolve({ available: false }));
  });
});

ipcMain.handle('claude-send', async (event, { message, memoContext }) => {
  return new Promise((resolve) => {
    const systemPrompt = `You are an AI assistant embedded in a note-taking app called Flake. The user is working on a memo. Help them with their request about the memo content. Always respond in the same language the user uses. If the user asks you to write/edit/generate content, output ONLY the content itself without explanations. If the user asks you to write Python code that manipulates memos, use the flake_sdk library (already installed and importable).

=== Flake Python SDK Reference ===
from flake_sdk import Flake, Memo

flake = Flake()
flake.list() -> List[Memo]                          # all memos
flake.get(id=...) or flake.get(title=...) -> Memo   # find one
flake.create(title="", content="") -> Memo           # new memo
flake.update(id, title=..., content=...) -> Memo     # update
flake.delete(id) -> bool                             # delete
flake.search("query") -> List[Memo]                  # search

Memo properties/methods:
  memo.title, memo.content (HTML), memo.text (plain), memo.id
  memo.lines -> List[str]          # content as lines
  memo.line_count -> int
  memo.get_line(n) -> str          # 1-based
  memo.set_line(n, text)           # modify line n
  memo.insert_line(n, text)        # insert before line n
  memo.delete_line(n)              # delete line n
  memo.get_lines(start, end)       # range (inclusive)
  memo.replace_lines(start, end, new_lines)
  memo.append(text)                # append to end
  memo.find_lines("query")        # -> [(line_num, text), ...]
  memo.save()                      # persist changes
=================================

Current memo title: ${memoContext.title || '(untitled)'}
Current memo content:
${memoContext.content || '(empty)'}`;

    const fullPrompt = `${systemPrompt}\n\nUser request: ${message}`;

    const proc = spawn('claude', ['-p', '--output-format', 'text'], {
      shell: true,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdin.write(fullPrompt);
    proc.stdin.end();

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      // Stream chunks to renderer
      mainWindow.webContents.send('claude-stream', chunk);
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      claudeProcess = null;
      if (code === 0) {
        resolve({ success: true, response: stdout.trim() });
      } else {
        resolve({ success: false, error: stderr || 'Claude process exited with code ' + code });
      }
    });

    proc.on('error', (err) => {
      claudeProcess = null;
      resolve({ success: false, error: 'Claude CLI not found. Install it first.' });
    });

    claudeProcess = proc;
  });
});

ipcMain.handle('claude-stop', async () => {
  if (claudeProcess) {
    claudeProcess.kill();
    claudeProcess = null;
    return { success: true };
  }
  return { success: false };
});

// Python script execution
const runningScripts = new Map();

ipcMain.handle('run-script', async (event, { code, blockId }) => {
  return new Promise((resolve) => {
    const sdkPath = path.join(__dirname, '..', 'sdk');
    const existingPythonPath = process.env.PYTHONPATH || '';
    const pythonPath = existingPythonPath ? `${sdkPath}:${existingPythonPath}` : sdkPath;

    const proc = spawn('python3', ['-u', '-c', code], {
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONPATH: pythonPath },
      timeout: 30000,
    });

    runningScripts.set(blockId, proc);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      mainWindow.webContents.send('script-output', { blockId, chunk, stream: 'stdout' });
    });

    proc.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      mainWindow.webContents.send('script-output', { blockId, chunk, stream: 'stderr' });
    });

    proc.on('close', (code) => {
      runningScripts.delete(blockId);
      resolve({ success: code === 0, stdout, stderr, exitCode: code });
    });

    proc.on('error', (err) => {
      runningScripts.delete(blockId);
      resolve({ success: false, stderr: err.message, exitCode: -1 });
    });
  });
});

ipcMain.handle('stop-script', async (event, blockId) => {
  const proc = runningScripts.get(blockId);
  if (proc) {
    proc.kill();
    runningScripts.delete(blockId);
    return { success: true };
  }
  return { success: false };
});

// Window controls
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());
