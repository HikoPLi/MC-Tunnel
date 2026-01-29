const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

const { loadConfig, saveConfig, getDefaultLogFile } = require('./config');
const { probeCloudflared, installCloudflared } = require('./cloudflared');
const { startTunnel, stopTunnel, isRunning } = require('./tunnel');

let mainWindow = null;

function sendStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tunnel:status', status);
  }
}

function sendInstallLog(message) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cloudflared:install-log', message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 860,
    minHeight: 640,
    backgroundColor: '#0e1116',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (isRunning()) {
    stopTunnel();
  }
});

ipcMain.handle('config:load', () => loadConfig());

ipcMain.handle('config:save', (_event, partial) => saveConfig(partial));

ipcMain.handle('cloudflared:check', async () => {
  const config = loadConfig();
  return probeCloudflared(config.cloudflaredPath);
});

ipcMain.handle('cloudflared:install', async () => {
  const installDir = path.join(app.getPath('userData'), 'bin');
  const result = await installCloudflared(installDir, sendInstallLog);
  if (result.ok && result.path) {
    saveConfig({ cloudflaredPath: result.path });
  }
  return result;
});

ipcMain.handle('tunnel:start', async (_event, config) => {
  const merged = saveConfig(config);
  const probe = await probeCloudflared(merged.cloudflaredPath);
  if (!probe.ok) {
    return { ok: false, error: probe.error || 'cloudflared not available', details: probe.output };
  }

  const result = startTunnel(merged, {
    onLog: (line) => mainWindow && mainWindow.webContents.send('tunnel:log', line),
    onExit: (info) => {
      sendStatus({ running: false, ...info });
    }
  });

  if (result.ok) {
    sendStatus({ running: true, pid: result.pid, startedAt: new Date().toISOString() });
  }

  return result;
});

ipcMain.handle('tunnel:stop', async () => {
  const result = stopTunnel();
  if (result.ok) {
    sendStatus({ running: false });
  }
  return result;
});

ipcMain.handle('dialog:pick-cloudflared', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select cloudflared binary',
    properties: ['openFile'],
    filters: process.platform === 'win32'
      ? [{ name: 'cloudflared', extensions: ['exe'] }]
      : [{ name: 'All files', extensions: ['*'] }]
  });

  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('dialog:pick-logfile', async () => {
  const defaultPath = getDefaultLogFile();
  const result = await dialog.showSaveDialog({
    title: 'Select log file',
    defaultPath,
    filters: [{ name: 'Log files', extensions: ['log', 'txt'] }]
  });

  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

ipcMain.handle('log:open', async () => {
  const config = loadConfig();
  return shell.openPath(config.logFile || getDefaultLogFile());
});

ipcMain.handle('log:open-dir', async () => {
  const config = loadConfig();
  const logFile = config.logFile || getDefaultLogFile();
  return shell.openPath(path.dirname(logFile));
});
