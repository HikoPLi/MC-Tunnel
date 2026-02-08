const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

const { loadConfig, saveConfig, getDefaultLogFile } = require('./config');
const { probeCloudflared, installCloudflared } = require('./cloudflared');
const { checkForAppUpdate, downloadUpdateAsset, normalizeVersion } = require('./appupdate');
const { validateConfig, parseLocalBind, formatLocalBind } = require('./validation');
const { checkPort, pickFreePort } = require('./portcheck');
const {
  listConnections,
  startConnection,
  startTunnel,
  stopConnection,
  stopTunnel,
  isRunning
} = require('./tunnel');
const { isZeroTrustUrl } = require('./zerotrust');
const { findPortOwners, killPortOwners } = require('./portowner');

let mainWindow = null;
let runtimeTunnelSettings = null;
let updateScheduler = null;
let updateStartupTimer = null;
let updateCheckPending = false;
let updateDownloadPending = false;
let lastPromptedUpdateVersion = '';

const UPDATE_SOURCE_OWNER = 'HikoPLi';
const UPDATE_SOURCE_REPO = 'MC-Tunnel';
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function getManagedCloudflaredDir() {
  return path.join(app.getPath('userData'), 'bin');
}

async function probeResolvedCloudflared(cloudflaredPath) {
  return probeCloudflared(cloudflaredPath, { installDir: getManagedCloudflaredDir() });
}

function sendStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tunnel:status', status);
  }
}

function sendConnections(connections) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('tunnel:connections', connections);
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

function sendAppUpdate(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:update', payload);
  }
}

function getUpdateDownloadDir() {
  return path.join(app.getPath('userData'), 'updates');
}

function formatPublishedAt(value) {
  if (!value) return 'unknown';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'unknown';
  return parsed.toISOString().slice(0, 10);
}

function buildUpdateDetail(info) {
  const lines = [
    `Current version: v${info.currentVersion}`,
    `Latest version : v${info.latestVersion}`,
    `Package        : ${info.asset.name}`,
    `Published      : ${formatPublishedAt(info.publishedAt)}`
  ];
  if (info.releaseUrl) {
    lines.push(`Release page   : ${info.releaseUrl}`);
  }
  if (info.releaseNotes) {
    lines.push('', info.releaseNotes);
  }
  return lines.join('\n');
}

async function installDownloadedUpdate(filePath, latestVersion) {
  const openError = await shell.openPath(filePath);
  if (openError) {
    sendAppUpdate({ phase: 'error', version: latestVersion, error: openError });
    if (mainWindow && !mainWindow.isDestroyed()) {
      await dialog.showMessageBox(mainWindow, {
        type: 'error',
        title: 'Install failed',
        message: 'Failed to open the downloaded installer package.',
        detail: openError
      });
    }
    return { ok: false, error: openError };
  }

  sendAppUpdate({ phase: 'installing', version: latestVersion, filePath });

  if (process.platform === 'win32') {
    setTimeout(() => app.quit(), 1200);
  } else if (mainWindow && !mainWindow.isDestroyed()) {
    const message = process.platform === 'darwin'
      ? 'Installer opened. Complete installation, then relaunch the app.'
      : 'Package opened. Complete installation with your system installer.';
    await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Installer opened',
      message
    });
  }

  return { ok: true, action: 'install-opened', filePath };
}

async function downloadAndInstallUpdate(info) {
  if (updateDownloadPending) {
    return { ok: false, error: 'Update download is already running' };
  }

  updateDownloadPending = true;
  sendAppUpdate({ phase: 'downloading', version: info.latestVersion, progress: 0, asset: info.asset.name });

  let lastPercent = -1;
  const downloadResult = await downloadUpdateAsset(info.asset, getUpdateDownloadDir(), (progress) => {
    if (!progress) return;
    if (!Number.isFinite(progress.percent)) return;
    const percent = Math.max(0, Math.min(100, progress.percent));
    if (percent === lastPercent || (percent % 5 !== 0 && percent !== 100)) return;
    lastPercent = percent;
    sendAppUpdate({ phase: 'downloading', version: info.latestVersion, progress: percent, asset: info.asset.name });
  });

  updateDownloadPending = false;

  if (!downloadResult.ok) {
    sendAppUpdate({ phase: 'error', version: info.latestVersion, error: downloadResult.error || 'Update download failed' });
    return downloadResult;
  }

  sendAppUpdate({
    phase: 'downloaded',
    version: info.latestVersion,
    filePath: downloadResult.path,
    asset: info.asset.name
  });

  if (!mainWindow || mainWindow.isDestroyed()) {
    return { ok: true, action: 'downloaded', filePath: downloadResult.path };
  }

  const installPrompt = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Update downloaded',
    message: `Version v${info.latestVersion} has been downloaded.`,
    detail: `File: ${downloadResult.path}`,
    buttons: ['Install now', 'Later'],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  if (installPrompt.response !== 0) {
    return { ok: true, action: 'downloaded-later', filePath: downloadResult.path };
  }

  return installDownloadedUpdate(downloadResult.path, info.latestVersion);
}

function stopAppUpdateScheduler() {
  if (updateStartupTimer) {
    clearTimeout(updateStartupTimer);
    updateStartupTimer = null;
  }
  if (updateScheduler) {
    clearInterval(updateScheduler);
    updateScheduler = null;
  }
}

function startAppUpdateScheduler(config) {
  stopAppUpdateScheduler();
  const settings = config && config.settings ? config.settings : {};
  if (!settings.autoCheckAppUpdate) return;

  updateStartupTimer = setTimeout(() => {
    runAppUpdateCheck({ manual: false, ignoreSkipped: false }).catch(() => {});
  }, 12000);

  updateScheduler = setInterval(() => {
    runAppUpdateCheck({ manual: false, ignoreSkipped: false }).catch(() => {});
  }, UPDATE_CHECK_INTERVAL_MS);
}

async function runAppUpdateCheck(options = {}) {
  const manual = Boolean(options.manual);
  const ignoreSkipped = Boolean(options.ignoreSkipped);
  if (updateCheckPending) {
    if (manual) {
      return { ok: false, error: 'Update check is already running' };
    }
    return { ok: true, skipped: true };
  }

  updateCheckPending = true;
  sendAppUpdate({ phase: 'checking', manual });

  try {
    const currentConfig = loadConfig();
    const skippedVersion = normalizeVersion(currentConfig.skippedAppVersion || '');
    const checkResult = await checkForAppUpdate({
      owner: UPDATE_SOURCE_OWNER,
      repo: UPDATE_SOURCE_REPO,
      currentVersion: app.getVersion(),
      platform: process.platform,
      arch: process.arch
    });

    if (!checkResult.ok) {
      sendAppUpdate({ phase: 'error', manual, error: checkResult.error || 'Update check failed' });
      if (manual && mainWindow && !mainWindow.isDestroyed()) {
        await dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Update check failed',
          message: checkResult.error || 'Update check failed'
        });
      }
      return checkResult;
    }

    if (!checkResult.updateAvailable) {
      lastPromptedUpdateVersion = '';
      sendAppUpdate({ phase: 'no-update', manual, version: checkResult.currentVersion });
      if (manual && mainWindow && !mainWindow.isDestroyed()) {
        await dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: 'No updates found',
          message: `You are already on the latest version (v${checkResult.currentVersion}).`
        });
      }
      return checkResult;
    }

    if (!manual && !ignoreSkipped && skippedVersion && skippedVersion === checkResult.latestVersion) {
      sendAppUpdate({ phase: 'skipped', version: skippedVersion });
      return { ok: true, updateAvailable: false, skipped: true, latestVersion: skippedVersion };
    }

    if (!manual && lastPromptedUpdateVersion === checkResult.latestVersion) {
      sendAppUpdate({ phase: 'available', version: checkResult.latestVersion, deferred: true });
      return { ok: true, updateAvailable: true, action: 'deferred', latestVersion: checkResult.latestVersion };
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: true, updateAvailable: true, action: 'pending-no-window', latestVersion: checkResult.latestVersion };
    }

    sendAppUpdate({ phase: 'available', version: checkResult.latestVersion, asset: checkResult.asset.name });

    lastPromptedUpdateVersion = checkResult.latestVersion;
    const prompt = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Update available',
      message: `A new version is available: v${checkResult.latestVersion}`,
      detail: buildUpdateDetail(checkResult),
      buttons: ['Download and install', 'Skip this version', 'Later'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    });

    if (prompt.response === 1) {
      saveConfig({ skippedAppVersion: checkResult.latestVersion });
      sendAppUpdate({ phase: 'skipped', version: checkResult.latestVersion });
      return { ok: true, updateAvailable: true, action: 'skip', latestVersion: checkResult.latestVersion };
    }

    if (prompt.response === 2) {
      sendAppUpdate({ phase: 'available', version: checkResult.latestVersion, deferred: true });
      return { ok: true, updateAvailable: true, action: 'later', latestVersion: checkResult.latestVersion };
    }

    saveConfig({ skippedAppVersion: '' });
    return downloadAndInstallUpdate(checkResult);
  } finally {
    updateCheckPending = false;
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

function bindKey(bind) {
  if (!bind || !bind.host) return '';
  return `${bind.host}|${bind.port}`;
}

async function pickAutoBind(host, usedKeys) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await pickFreePort(host);
    if (!result.ok) {
      return result;
    }
    const key = bindKey(result);
    if (!key || usedKeys.has(key)) {
      continue;
    }
    usedKeys.add(key);
    return { ok: true, bind: result };
  }
  return { ok: false, error: `Failed to auto-assign an available local bind on ${host}` };
}

function getRunningBindEntries() {
  return listConnections()
    .filter((item) => item && item.running && item.localBind)
    .map((item) => {
      const parsed = parseLocalBind(item.localBind);
      if (!parsed.ok) return null;
      return {
        host: parsed.host,
        port: parsed.port,
        hostname: item.hostname
      };
    })
    .filter(Boolean);
}

async function resolveTunnelTargets(validation, settings, reservedBinds = []) {
  const hostnames = Array.isArray(validation.hostnames) ? validation.hostnames : [];
  const customBinds = Array.isArray(validation.binds) ? validation.binds : [];
  const reserved = Array.isArray(reservedBinds) ? reservedBinds.filter((bind) => bind && bind.host) : [];
  const reservedByKey = new Map();
  reserved.forEach((bind) => {
    const key = bindKey(bind);
    if (!key || reservedByKey.has(key)) return;
    reservedByKey.set(key, String(bind.hostname || '').trim());
  });
  const reservedKeys = new Set(Array.from(reservedByKey.keys()));
  const usedKeys = new Set([
    ...Array.from(reservedKeys),
    ...customBinds.map((bind) => bindKey(bind)).filter(Boolean)
  ]);
  const autoHost = customBinds.length > 0
    ? customBinds[0].host
    : (reserved.length > 0 ? reserved[0].host : '127.0.0.1');
  const targets = [];

  for (let index = 0; index < hostnames.length; index += 1) {
    const hostname = hostnames[index];
    let bind = customBinds[index] || null;
    let autoAssigned = false;

    if (bind) {
      const key = bindKey(bind);
      const occupiedBy = reservedByKey.get(key);
      if (reservedKeys.has(key) && occupiedBy !== hostname) {
        return {
          ok: false,
          error: `Hostname "${hostname}": local bind ${formatLocalBind(bind)} is already used by running connection ${occupiedBy || 'unknown'}`
        };
      }
      if (settings && settings.checkPortOnStart && !(reservedKeys.has(key) && occupiedBy === hostname)) {
        const portStatus = await ensurePortAvailable(bind, settings);
        if (!portStatus.ok) {
          return {
            ok: false,
            error: `Hostname "${hostname}": ${portStatus.error}`,
            code: portStatus.code,
            details: portStatus.details
          };
        }
      }
    } else {
      const picked = await pickAutoBind(autoHost, usedKeys);
      if (!picked.ok) {
        return { ok: false, error: `Hostname "${hostname}": ${picked.error}` };
      }
      bind = picked.bind;
      autoAssigned = true;
    }

    const localBind = formatLocalBind(bind);
    if (!localBind) {
      return { ok: false, error: `Hostname "${hostname}": invalid local bind` };
    }

    targets.push({
      hostname,
      host: bind.host,
      port: bind.port,
      localBind,
      autoAssigned
    });
  }

  return { ok: true, targets };
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
  const settings = config.settings || {};
  if (!settings.autoStartTunnel) return;
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

  const targetsResult = await resolveTunnelTargets(validation, settings);
  if (!targetsResult.ok) {
    sendStatus({ running: false, error: `Auto-start failed: ${targetsResult.error}`, details: targetsResult.details });
    return;
  }

  const probe = await probeResolvedCloudflared(profile.cloudflaredPath);
  if (!probe.ok) {
    sendStatus({ running: false, error: 'Auto-start failed: cloudflared not available', details: probe.output });
    return;
  }

  const result = startTunnel({ ...profile, cloudflaredPath: probe.path, settings, targets: targetsResult.targets }, {
    onLog: (line) => mainWindow && mainWindow.webContents.send('tunnel:log', line),
    onAuthUrl: createZeroTrustHandler(settings),
    onConnections: (connections) => sendConnections(connections),
    onExit: (info) => sendStatus({ running: false, ...info })
  });

  if (result.ok) {
    runtimeTunnelSettings = settings;
    sendConnections(result.connections || listConnections());
    sendStatus({ running: true, pids: result.pids, targets: result.targets, startedAt: new Date().toISOString() });
  }
}

app.whenReady().then(async () => {
  createWindow();
  startAppUpdateScheduler(loadConfig());
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
  stopAppUpdateScheduler();
  if (isRunning()) {
    stopTunnel();
  }
});

ipcMain.handle('config:load', () => loadConfig());

ipcMain.handle('config:save', (_event, partial) => {
  const saved = saveConfig(partial);
  if (app.isReady()) {
    startAppUpdateScheduler(saved);
  }
  return saved;
});

ipcMain.handle('app:version', () => app.getVersion());

ipcMain.handle('app-update:check', async (_event, options) => {
  const manual = !options || options.manual !== false;
  const ignoreSkipped = !options || options.ignoreSkipped !== false;
  return runAppUpdateCheck({ manual, ignoreSkipped });
});

ipcMain.handle('cloudflared:check', async (_event, cloudflaredPath) => {
  return probeResolvedCloudflared(cloudflaredPath);
});

ipcMain.handle('cloudflared:install', async (_event, options) => {
  const installDir = getManagedCloudflaredDir();
  return installCloudflared(installDir, { onLog: sendInstallLog, requireChecksum: options && options.requireChecksum });
});

ipcMain.handle('tunnel:start', async (_event, config) => {
  const validation = validateConfig(config);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const settings = config.settings || loadConfig().settings;
  const reservedBinds = getRunningBindEntries();
  const targetsResult = await resolveTunnelTargets(validation, settings, reservedBinds);
  if (!targetsResult.ok) {
    return {
      ok: false,
      error: targetsResult.error,
      code: targetsResult.code,
      details: targetsResult.details
    };
  }

  const probe = await probeResolvedCloudflared(config.cloudflaredPath);
  if (!probe.ok) {
    return { ok: false, error: probe.error || 'cloudflared not available', details: probe.output };
  }

  const result = startTunnel({ ...config, cloudflaredPath: probe.path, settings, targets: targetsResult.targets }, {
    onLog: (line) => mainWindow && mainWindow.webContents.send('tunnel:log', line),
    onAuthUrl: createZeroTrustHandler(settings),
    onConnections: (connections) => sendConnections(connections),
    onExit: (info) => {
      sendStatus({ running: false, ...info });
    }
  });

  if (result.ok) {
    runtimeTunnelSettings = settings;
    sendConnections(result.connections || listConnections());
    sendStatus({ running: true, pids: result.pids, targets: result.targets, startedAt: new Date().toISOString() });
  }

  return result;
});

ipcMain.handle('tunnel:stop', async () => {
  const result = stopTunnel();
  if (result.ok) {
    sendConnections(listConnections());
  }
  return result;
});

ipcMain.handle('tunnel:connections', async () => {
  return listConnections();
});

ipcMain.handle('tunnel:start-connection', async (_event, connectionId) => {
  const id = String(connectionId || '').trim();
  if (!id) {
    return { ok: false, error: 'Connection id is required' };
  }

  const connections = listConnections();
  const connection = connections.find((item) => item.id === id);
  if (!connection) {
    return { ok: false, error: 'Connection not found' };
  }
  const occupied = connections.find((item) => item.running && item.id !== id && item.localBind === connection.localBind);
  if (occupied) {
    return { ok: false, error: `Local bind ${connection.localBind} is already used by running connection ${occupied.hostname}` };
  }

  const settings = runtimeTunnelSettings || loadConfig().settings || {};
  if (settings.checkPortOnStart) {
    const bind = parseLocalBind(connection.localBind);
    if (!bind.ok) {
      return { ok: false, error: bind.error };
    }
    const portStatus = await ensurePortAvailable(bind, settings);
    if (!portStatus.ok) {
      return { ok: false, error: portStatus.error, code: portStatus.code, details: portStatus.details };
    }
  }

  const result = startConnection(id);
  if (result.ok) {
    const nextConnections = listConnections();
    sendConnections(nextConnections);
    sendStatus({ running: true, connectionId: id });
    return { ok: true, connection: result.connection, connections: nextConnections };
  }

  return result;
});

ipcMain.handle('tunnel:stop-connection', async (_event, connectionId) => {
  const id = String(connectionId || '').trim();
  if (!id) {
    return { ok: false, error: 'Connection id is required' };
  }

  const result = stopConnection(id);
  if (result.ok) {
    const nextConnections = listConnections();
    sendConnections(nextConnections);
    if (!isRunning()) {
      sendStatus({ running: false });
    }
    return { ok: true, connections: nextConnections };
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
    if (app.isReady()) {
      startAppUpdateScheduler(saved);
    }
    return { ok: true, config: saved };
  } catch (err) {
    return { ok: false, error: err.message || 'Import failed' };
  }
});

ipcMain.handle('config:open-dir', async () => {
  return shell.openPath(app.getPath('userData'));
});
