const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

const { loadConfig, saveConfig, getDefaultLogFile } = require('./config');
const { probeCloudflared, installCloudflared } = require('./cloudflared');
const { validateConfig, parseLocalBind } = require('./validation');
const { checkPort } = require('./portcheck');
const { startTunnel, stopTunnel, isRunning } = require('./tunnel');
const { isZeroTrustUrl } = require('./zerotrust');
const { findPortOwners, killPortOwners } = require('./portowner');

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

function sendAuthUrl(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tunnel:auth-url', payload);
  }
}

function createZeroTrustHandler(settings) {
  const opened = new Set();
  const autoOpenEnabled = !settings || settings.autoOpenZeroTrust !== false;
  return (url) => {
    if (!isZeroTrustUrl(url)) return;
    let autoOpened = false;
    if (autoOpenEnabled && !opened.has(url)) {
      opened.add(url);
      autoOpened = true;
      shell.openExternal(url);
    }
    sendAuthUrl({ url, autoOpened });
  };
}

function formatOwnerLines(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  return entries
    .map((entry) => {
      const label = entry.name ? ` (${entry.name})` : '';
      return `PID ${entry.pid}${label}`;
    })
    .join('\n');
}

async function confirmKillPort(port, owners) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const detailLines = formatOwnerLines(owners);
  const detail = detailLines
    ? `Detected processes:\n${detailLines}`
    : 'Process details were not available.';

  const first = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Port in use',
    message: `Port ${port} is already in use.`,
    detail,
    buttons: ['Cancel', 'Continue'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (first.response !== 1) return false;

  const second = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Confirm kill',
    message: `This will terminate the process(es) using port ${port}.`,
    detail: 'This can cause data loss or interrupt other applications.',
    buttons: ['Cancel', 'Continue'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (second.response !== 1) return false;

  const third = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'Final confirmation',
    message: `Final confirmation: kill process(es) on port ${port}?`,
    detail: 'This action cannot be undone.',
    buttons: ['Cancel', 'Kill now'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  return third.response === 1;
}

async function ensurePortAvailable(bind, settings) {
  const portStatus = await checkPort(bind.host, bind.port);
  if (portStatus.ok) {
    return { ok: true };
  }

  const canKill = settings && settings.allowPortKill && portStatus.code === 'EADDRINUSE';
  if (!canKill) {
    return { ok: false, error: portStatus.error, code: portStatus.code };
  }

  const owners = await findPortOwners(bind.port);
  if (!owners.ok) {
    return { ok: false, error: 'Port is already in use', details: owners.error || 'Failed to detect process owners' };
  }
  if (!Array.isArray(owners.entries) || owners.entries.length === 0) {
    return { ok: false, error: 'Port is already in use', details: 'No process owners were detected for this port' };
  }

  const confirmed = await confirmKillPort(bind.port, owners.entries);
  if (!confirmed) {
    return { ok: false, error: 'Port is already in use' };
  }

  const killResult = await killPortOwners(owners.entries);
  if (!killResult.ok) {
    return { ok: false, error: 'Failed to terminate process using port', details: killResult.error };
  }

  const recheck = await checkPort(bind.host, bind.port);
  if (!recheck.ok) {
    return { ok: false, error: recheck.error || 'Port is still in use', code: recheck.code };
  }

  return { ok: true, killed: true };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    minWidth: 860,
    minHeight: 640,
    backgroundColor: '#0e1116',
    icon: path.join(__dirname, '../renderer/assets/mc-tunnel_icon.png'),
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
    const portStatus = await ensurePortAvailable(bind, config.settings);
    if (!portStatus.ok) {
      sendStatus({ running: false, error: `Auto-start failed: ${portStatus.error}`, details: portStatus.details });
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
    onAuthUrl: createZeroTrustHandler(config.settings),
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
    const portStatus = await ensurePortAvailable(bind, settings);
    if (!portStatus.ok) {
      return { ok: false, error: portStatus.error, code: portStatus.code, details: portStatus.details };
    }
  }

  const probe = await probeCloudflared(config.cloudflaredPath);
  if (!probe.ok) {
    return { ok: false, error: probe.error || 'cloudflared not available', details: probe.output };
  }

  const result = startTunnel({ ...config, settings }, {
    onLog: (line) => mainWindow && mainWindow.webContents.send('tunnel:log', line),
    onAuthUrl: createZeroTrustHandler(settings),
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

ipcMain.handle('external:open', async (_event, url) => {
  if (!isZeroTrustUrl(url)) {
    return { ok: false, error: 'Invalid Zero Trust URL' };
  }
  await shell.openExternal(url);
  return { ok: true };
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
