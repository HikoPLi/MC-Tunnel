const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

const { loadConfig, saveConfig, getDefaultLogFile } = require('./config');
const { probeCloudflared, installCloudflared } = require('./cloudflared');
const { validateConfig, parseLocalBind } = require('./validation');
const { checkPort } = require('./portcheck');
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

async function tryAutoStart() {
  const config = loadConfig();
  if (!config.settings || !config.settings.autoStartTunnel) return;
  const profile = config.profiles.find((item) => item.id === config.activeProfileId);
  if (!profile) {
    sendStatus({ running: false, error: 'Auto-start skipped: no active profile' });
    return;
  }

  const validation = validateConfig(profile);
  if (!validation.ok) {
    sendStatus({ running: false, error: `Auto-start failed: ${validation.error}` });
    return;
  }

  if (config.settings.checkPortOnStart) {
    const bind = parseLocalBind(profile.localBind);
    if (!bind.ok) {
      sendStatus({ running: false, error: `Auto-start failed: ${bind.error}` });
      return;
    }
    const portStatus = await checkPort(bind.host, bind.port);
    if (!portStatus.ok) {
      sendStatus({ running: false, error: `Auto-start failed: ${portStatus.error}` });
      return;
    }
  }

  const probe = await probeCloudflared(profile.cloudflaredPath);
  if (!probe.ok) {
    sendStatus({ running: false, error: 'Auto-start failed: cloudflared not available', details: probe.output });
    return;
  }

  const result = startTunnel({ ...profile, settings: config.settings }, {
    onLog: (line) => mainWindow && mainWindow.webContents.send('tunnel:log', line),
    onExit: (info) => sendStatus({ running: false, ...info })
  });

  if (result.ok) {
    sendStatus({ running: true, pid: result.pid, startedAt: new Date().toISOString() });
  }
}

app.whenReady().then(async () => {
  createWindow();
  await tryAutoStart();

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

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('cloudflared:check', async (_event, cloudflaredPath) => {
  return probeCloudflared(cloudflaredPath);
});

ipcMain.handle('cloudflared:install', async (_event, options) => {
  const installDir = path.join(app.getPath('userData'), 'bin');
  return installCloudflared(installDir, { onLog: sendInstallLog, requireChecksum: options && options.requireChecksum });
});

ipcMain.handle('tunnel:start', async (_event, config) => {
  const validation = validateConfig(config);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const settings = config.settings || loadConfig().settings;

  if (settings.checkPortOnStart) {
    const bind = parseLocalBind(config.localBind);
    if (!bind.ok) {
      return { ok: false, error: bind.error };
    }
    const portStatus = await checkPort(bind.host, bind.port);
    if (!portStatus.ok) {
      return { ok: false, error: portStatus.error, code: portStatus.code };
    }
  }

  const probe = await probeCloudflared(config.cloudflaredPath);
  if (!probe.ok) {
    return { ok: false, error: probe.error || 'cloudflared not available', details: probe.output };
  }

  const result = startTunnel({ ...config, settings }, {
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

ipcMain.handle('port:check', async (_event, localBind) => {
  const bind = parseLocalBind(localBind);
  if (!bind.ok) return bind;
  return checkPort(bind.host, bind.port);
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

ipcMain.handle('dialog:pick-logfile', async (_event, suggestedPath) => {
  const options = {
    title: 'Select log file',
    filters: [{ name: 'Log files', extensions: ['log', 'txt'] }]
  };
  if (suggestedPath) {
    options.defaultPath = suggestedPath;
  }
  const result = await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

ipcMain.handle('log:open', async (_event, logFile) => {
  if (!logFile) {
    return 'Log file is not set';
  }
  return shell.openPath(logFile);
});

ipcMain.handle('log:open-dir', async (_event, logFile) => {
  if (!logFile) {
    return 'Log file is not set';
  }
  return shell.openPath(path.dirname(logFile));
});

ipcMain.handle('log:default-path', () => {
  return getDefaultLogFile();
});

ipcMain.handle('config:export', async () => {
  const config = loadConfig();
  const result = await dialog.showSaveDialog({
    title: 'Export config',
    defaultPath: 'mc-tunnel-config.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, error: 'Export canceled' };
  fs.writeFileSync(result.filePath, JSON.stringify(config, null, 2));
  return { ok: true, path: result.filePath };
});

ipcMain.handle('config:import', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Import config',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return { ok: false, error: 'Import canceled' };
  const filePath = result.filePaths[0];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const saved = saveConfig(parsed);
    return { ok: true, config: saved };
  } catch (err) {
    return { ok: false, error: err.message || 'Import failed' };
  }
});

ipcMain.handle('config:open-dir', async () => {
  return shell.openPath(app.getPath('userData'));
});
