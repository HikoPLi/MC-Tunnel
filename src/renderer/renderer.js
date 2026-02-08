const elements = {
  hostname: document.getElementById('hostname'),
  localBind: document.getElementById('localBind'),
  logLevel: document.getElementById('logLevel'),
  logFile: document.getElementById('logFile'),
  cloudflaredPath: document.getElementById('cloudflaredPath'),
  savedLinks: document.getElementById('savedLinks'),
  saveLink: document.getElementById('saveLink'),
  loadLink: document.getElementById('loadLink'),
  deleteLink: document.getElementById('deleteLink'),
  profileName: document.getElementById('profileName'),
  profileSelect: document.getElementById('profileSelect'),
  saveProfile: document.getElementById('saveProfile'),
  loadProfile: document.getElementById('loadProfile'),
  deleteProfile: document.getElementById('deleteProfile'),
  checkPortOnStart: document.getElementById('checkPortOnStart'),
  allowPortKill: document.getElementById('allowPortKill'),
  rotateLogs: document.getElementById('rotateLogs'),
  maxLogSize: document.getElementById('maxLogSize'),
  maxLogBackups: document.getElementById('maxLogBackups'),
  requireChecksum: document.getElementById('requireChecksum'),
  autoOpenZeroTrust: document.getElementById('autoOpenZeroTrust'),
  autoStartTunnel: document.getElementById('autoStartTunnel'),
  saveSettings: document.getElementById('saveSettings'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  testPortBtn: document.getElementById('testPortBtn'),
  openLogBtn: document.getElementById('openLogBtn'),
  openLogDirBtn: document.getElementById('openLogDirBtn'),
  openConfigBtn: document.getElementById('openConfigBtn'),
  importConfigBtn: document.getElementById('importConfigBtn'),
  exportConfigBtn: document.getElementById('exportConfigBtn'),
  browseLog: document.getElementById('browseLog'),
  browseCloudflared: document.getElementById('browseCloudflared'),
  checkCloudflared: document.getElementById('checkCloudflared'),
  installCloudflared: document.getElementById('installCloudflared'),
  installStatus: document.getElementById('installStatus'),
  clearLog: document.getElementById('clearLog'),
  tunnelStatus: document.getElementById('tunnelStatus'),
  cloudflaredStatus: document.getElementById('cloudflaredStatus'),
  appVersion: document.getElementById('appVersion'),
  connectionSummary: document.getElementById('connectionSummary'),
  connectionList: document.getElementById('connectionList'),
  zeroTrustNotice: document.getElementById('zeroTrustNotice'),
  zeroTrustUrl: document.getElementById('zeroTrustUrl'),
  zeroTrustHint: document.getElementById('zeroTrustHint'),
  openZeroTrust: document.getElementById('openZeroTrust'),
  logOutput: document.getElementById('logOutput')
};

let logBuffer = [];
let savedLinks = [];
let profiles = [];
let activeProfileId = '';
let zeroTrustUrl = '';
let runtimeConnections = [];
let startTunnelPending = false;

function splitListInput(input) {
  return String(input || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function summarizeListInput(input, emptyLabel) {
  const items = splitListInput(input);
  if (items.length === 0) return emptyLabel || '';
  if (items.length === 1) return items[0];
  return `${items[0]} (+${items.length - 1})`;
}

function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function applySettings(settings) {
  const safe = settings || {};
  elements.checkPortOnStart.checked = Boolean(safe.checkPortOnStart);
  elements.allowPortKill.checked = Boolean(safe.allowPortKill);
  elements.rotateLogs.checked = Boolean(safe.rotateLogs);
  const size = Number(safe.maxLogSizeMB);
  elements.maxLogSize.value = Number.isFinite(size) && size > 0 ? String(size) : '5';
  const backups = Number(safe.maxLogBackups);
  elements.maxLogBackups.value = Number.isFinite(backups) && backups > 0 ? String(backups) : '3';
  elements.requireChecksum.checked = safe.requireChecksum !== false;
  elements.autoOpenZeroTrust.checked = safe.autoOpenZeroTrust !== false;
  elements.autoStartTunnel.checked = Boolean(safe.autoStartTunnel);
}

function collectSettings() {
  const maxSize = Number(elements.maxLogSize.value);
  const maxBackups = Number(elements.maxLogBackups.value);
  return {
    checkPortOnStart: elements.checkPortOnStart.checked,
    allowPortKill: elements.allowPortKill.checked,
    rotateLogs: elements.rotateLogs.checked,
    maxLogSizeMB: Number.isFinite(maxSize) && maxSize > 0 ? Math.floor(maxSize) : 5,
    maxLogBackups: Number.isFinite(maxBackups) && maxBackups > 0 ? Math.floor(maxBackups) : 3,
    requireChecksum: elements.requireChecksum.checked,
    autoOpenZeroTrust: elements.autoOpenZeroTrust.checked,
    autoStartTunnel: elements.autoStartTunnel.checked
  };
}

function applyConfig(config) {
  renderSavedLinks(config.savedLinks || []);
  renderProfiles(config.profiles || [], config.activeProfileId || '');
  applySettings(config.settings || {});
}

function collectConfig() {
  return {
    hostname: elements.hostname.value.trim(),
    localBind: elements.localBind.value.trim(),
    logLevel: elements.logLevel.value,
    logFile: elements.logFile.value.trim(),
    cloudflaredPath: elements.cloudflaredPath.value.trim(),
    settings: collectSettings()
  };
}

function setTunnelStatus(text, status) {
  elements.tunnelStatus.textContent = text;
  elements.tunnelStatus.dataset.status = status;
}

function setCloudflaredStatus(text, status) {
  elements.cloudflaredStatus.textContent = text;
  elements.cloudflaredStatus.dataset.status = status;
}

function setRunningState(isRunning) {
  elements.startBtn.disabled = startTunnelPending;
  elements.stopBtn.disabled = !isRunning;
}

function sanitizeConnections(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((item) => item && item.id)
    .map((item) => ({
      id: String(item.id),
      hostname: String(item.hostname || '').trim(),
      localBind: String(item.localBind || '').trim(),
      autoAssigned: Boolean(item.autoAssigned),
      running: Boolean(item.running),
      pid: Number.isInteger(item.pid) ? item.pid : null,
      lastError: String(item.lastError || '').trim()
    }));
}

function connectionStatus(connection) {
  if (connection.running) return { text: 'running', badge: 'running' };
  if (connection.lastError) return { text: 'error', badge: 'error' };
  return { text: 'stopped', badge: 'idle' };
}

function renderConnections(list) {
  runtimeConnections = sanitizeConnections(list);
  elements.connectionList.innerHTML = '';

  const runningCount = runtimeConnections.filter((item) => item.running).length;
  if (runtimeConnections.length === 0) {
    elements.connectionSummary.textContent = 'No configured connections';
    const empty = document.createElement('div');
    empty.className = 'connection-empty';
    empty.textContent = 'Start tunnel to generate connection list.';
    elements.connectionList.appendChild(empty);
    setRunningState(false);
    return;
  }

  elements.connectionSummary.textContent = `${runningCount}/${runtimeConnections.length} running`;
  setRunningState(runningCount > 0);

  runtimeConnections.forEach((connection) => {
    const row = document.createElement('div');
    row.className = 'connection-row';

    const main = document.createElement('div');
    main.className = 'connection-main';

    const title = document.createElement('div');
    title.className = 'connection-title';
    title.textContent = `${connection.hostname} -> ${connection.localBind}`;
    main.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'connection-sub';
    const suffix = connection.autoAssigned ? 'auto-assigned' : 'custom bind';
    const errorSuffix = connection.lastError ? ` | ${connection.lastError}` : '';
    sub.textContent = `${suffix}${errorSuffix}`;
    main.appendChild(sub);

    const controls = document.createElement('div');
    controls.className = 'connection-controls';

    const status = connectionStatus(connection);
    const statusBadge = document.createElement('span');
    statusBadge.className = 'badge';
    statusBadge.dataset.status = status.badge;
    statusBadge.textContent = connection.running && connection.pid
      ? `${status.text} #${connection.pid}`
      : status.text;
    controls.appendChild(statusBadge);

    const startBtn = document.createElement('button');
    startBtn.className = 'ghost';
    startBtn.dataset.action = 'start';
    startBtn.dataset.id = connection.id;
    startBtn.textContent = 'Start';
    startBtn.disabled = connection.running;
    controls.appendChild(startBtn);

    const stopBtn = document.createElement('button');
    stopBtn.className = 'ghost';
    stopBtn.dataset.action = 'stop';
    stopBtn.dataset.id = connection.id;
    stopBtn.textContent = 'Stop';
    stopBtn.disabled = !connection.running;
    controls.appendChild(stopBtn);

    row.appendChild(main);
    row.appendChild(controls);
    elements.connectionList.appendChild(row);
  });
}

function appendLog(line) {
  if (!line) return;
  logBuffer.push(line);
  if (logBuffer.length > 400) {
    logBuffer = logBuffer.slice(-400);
  }
  elements.logOutput.textContent = logBuffer.join('');
  elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
}

function setZeroTrustNotice(url, autoOpened) {
  zeroTrustUrl = String(url || '').trim();
  if (!zeroTrustUrl) {
    elements.zeroTrustNotice.classList.add('hidden');
    elements.zeroTrustUrl.textContent = '';
    elements.zeroTrustHint.textContent = '';
    return;
  }
  elements.zeroTrustNotice.classList.remove('hidden');
  elements.zeroTrustUrl.textContent = zeroTrustUrl;
  elements.zeroTrustHint.textContent = autoOpened
    ? 'Browser opened automatically. Complete verification, then keep the tunnel running.'
    : 'Open the link to complete verification, then keep the tunnel running.';
}

function sanitizeSavedLinks(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const cleaned = [];
  list.forEach((item) => {
    if (!item) return;
    const hostname = String(item.hostname || '').trim();
    const localBind = String(item.localBind || '').trim();
    if (!hostname) return;
    const key = `${hostname}|${localBind}`;
    if (seen.has(key)) return;
    seen.add(key);
    cleaned.push({ hostname, localBind });
  });
  return cleaned;
}

function renderSavedLinks(list) {
  savedLinks = sanitizeSavedLinks(list);
  elements.savedLinks.innerHTML = '';

  if (savedLinks.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No saved links';
    elements.savedLinks.appendChild(opt);
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select saved link';
  elements.savedLinks.appendChild(placeholder);

  savedLinks.forEach((link, index) => {
    const opt = document.createElement('option');
    opt.value = String(index);
    const hostnameLabel = summarizeListInput(link.hostname, 'invalid hostname');
    const bindLabel = summarizeListInput(link.localBind, 'auto');
    opt.textContent = `${hostnameLabel} -> ${bindLabel}`;
    elements.savedLinks.appendChild(opt);
  });
}

function sanitizeProfiles(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const cleaned = [];
  list.forEach((item) => {
    if (!item) return;
    const id = String(item.id || '').trim() || generateId();
    if (seen.has(id)) return;
    seen.add(id);
    const name = String(item.name || '').trim() || 'Unnamed profile';
    cleaned.push({
      id,
      name,
      hostname: String(item.hostname || '').trim(),
      localBind: String(item.localBind || '').trim(),
      logLevel: String(item.logLevel || '').trim(),
      logFile: String(item.logFile || '').trim(),
      cloudflaredPath: String(item.cloudflaredPath || '').trim()
    });
  });
  return cleaned;
}

function renderProfiles(list, activeId) {
  profiles = sanitizeProfiles(list);
  activeProfileId = activeId || '';
  elements.profileSelect.innerHTML = '';

  if (profiles.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No profiles';
    elements.profileSelect.appendChild(opt);
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select profile';
  elements.profileSelect.appendChild(placeholder);

  profiles.forEach((profile) => {
    const opt = document.createElement('option');
    opt.value = profile.id;
    opt.textContent = profile.name;
    elements.profileSelect.appendChild(opt);
  });

  if (activeProfileId) {
    elements.profileSelect.value = activeProfileId;
    const active = profiles.find((profile) => profile.id === activeProfileId);
    if (active) {
      elements.profileName.value = active.name;
    }
  }
}

function getSelectedProfile() {
  const id = elements.profileSelect.value;
  if (!id) return null;
  return profiles.find((profile) => profile.id === id) || null;
}

async function init() {
  const config = await window.api.loadConfig();
  applyConfig(config);
  setTunnelStatus('Tunnel: idle', 'idle');
  renderConnections([]);

  const defaultLogFile = await window.api.getDefaultLogFile();
  if (!elements.logFile.value.trim() && defaultLogFile) {
    elements.logFile.value = defaultLogFile;
  }
  if (!elements.logLevel.value) {
    elements.logLevel.value = 'auto';
  }

  const version = await window.api.getAppVersion();
  if (version) {
    elements.appVersion.textContent = `app: v${version}`;
  }

  const cloudflared = await window.api.checkCloudflared(elements.cloudflaredPath.value.trim());
  if (cloudflared.ok) {
    setCloudflaredStatus('cloudflared: ready', 'running');
    if (!elements.cloudflaredPath.value.trim() && cloudflared.path) {
      elements.cloudflaredPath.value = cloudflared.path;
    }
  } else {
    setCloudflaredStatus('cloudflared: missing', 'error');
  }

  const connections = await window.api.listConnections();
  renderConnections(connections);
}

window.api.onLog((line) => appendLog(line));
window.api.onConnections((connections) => {
  renderConnections(connections);
});
window.api.onStatus((status) => {
  if (status.running) {
    setTunnelStatus('Tunnel: running', 'running');
    if (!runtimeConnections.some((item) => item.running)) {
      setRunningState(true);
    }
  } else {
    setTunnelStatus('Tunnel: stopped', status.error ? 'error' : 'idle');
    if (!runtimeConnections.some((item) => item.running)) {
      setRunningState(false);
    }
    setZeroTrustNotice('');
    if (status.error) {
      appendLog(`Status error: ${status.error}\n`);
    } else {
      appendLog('Tunnel stopped.\n');
    }
  }
});

window.api.onInstallLog((message) => {
  if (message) {
    elements.installStatus.textContent = `Install status: ${message}`;
  }
});

window.api.onAuthUrl((payload) => {
  const url = payload && payload.url ? String(payload.url).trim() : '';
  if (!url || !url.includes('/cdn-cgi/access/')) return;
  setZeroTrustNotice(url, payload.autoOpened);
  appendLog('Zero Trust verification required.\n');
});

elements.startBtn.addEventListener('click', async () => {
  if (startTunnelPending) return;
  startTunnelPending = true;
  elements.startBtn.disabled = true;
  setZeroTrustNotice('');
  const config = collectConfig();
  try {
    if (!config.hostname || !config.logLevel || !config.logFile) {
      appendLog('Start failed: hostname, log level, and log file are required.\n');
      setTunnelStatus('Tunnel: error', 'error');
      return;
    }
    const result = await window.api.startTunnel(config);
    if (result.ok) {
      if (Array.isArray(result.connections)) {
        renderConnections(result.connections);
      }
      const startedCount = Array.isArray(result.pids) ? result.pids.length : 0;
      if (Array.isArray(result.targets) && result.targets.length > 0) {
        if (startedCount > 0) {
          appendLog(`Started ${startedCount} new connection(s). Total configured: ${result.targets.length}.\n`);
        } else {
          appendLog(`No new connections started. Total configured: ${result.targets.length}.\n`);
        }
        result.targets.forEach((target) => {
          const suffix = target.autoAssigned ? ' (auto)' : '';
          appendLog(`Connection: ${target.hostname} -> ${target.localBind}${suffix}\n`);
        });
      } else {
        appendLog('Tunnel started.\n');
      }
      return;
    }
    if (!result.ok) {
      appendLog(`Start failed: ${result.error || 'unknown error'}\n`);
      if (result.details) {
        appendLog(`${result.details}\n`);
      }
      setTunnelStatus('Tunnel: error', 'error');
    }
  } finally {
    startTunnelPending = false;
    elements.startBtn.disabled = false;
  }
});

elements.stopBtn.addEventListener('click', async () => {
  appendLog('Stopping tunnel...\n');
  const result = await window.api.stopTunnel();
  if (!result.ok) {
    appendLog(`Stop failed: ${result.error || 'unknown error'}\n`);
  }
});

elements.connectionList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action][data-id]');
  if (!button) return;

  const action = button.dataset.action;
  const connectionId = button.dataset.id;
  if (!action || !connectionId) return;

  button.disabled = true;
  if (action === 'start') {
    const result = await window.api.startConnection(connectionId);
    if (!result.ok) {
      appendLog(`Start connection failed: ${result.error || 'unknown error'}\n`);
      if (result.details) {
        appendLog(`${result.details}\n`);
      }
      button.disabled = false;
    } else {
      appendLog('Connection started.\n');
      const connections = Array.isArray(result.connections) ? result.connections : await window.api.listConnections();
      renderConnections(connections);
    }
    return;
  }

  if (action === 'stop') {
    const result = await window.api.stopConnection(connectionId);
    if (!result.ok) {
      appendLog(`Stop connection failed: ${result.error || 'unknown error'}\n`);
      button.disabled = false;
    } else {
      appendLog('Connection stopping...\n');
      const connections = Array.isArray(result.connections) ? result.connections : await window.api.listConnections();
      renderConnections(connections);
    }
  }
});

elements.testPortBtn.addEventListener('click', async () => {
  const localBinds = splitListInput(elements.localBind.value);
  if (localBinds.length === 0) {
    appendLog('Port check skipped: no custom local bind; start will auto-assign available bind(s).\n');
    return;
  }

  for (let index = 0; index < localBinds.length; index += 1) {
    const localBind = localBinds[index];
    const result = await window.api.checkPort(localBind);
    const prefix = localBinds.length > 1 ? `Port check [${index + 1}/${localBinds.length}]` : 'Port check';
    if (result.ok) {
      appendLog(`${prefix}: ${localBind} is available.\n`);
    } else {
      appendLog(`${prefix} failed: ${localBind} -> ${result.error || 'unknown error'}\n`);
    }
  }
});

elements.checkCloudflared.addEventListener('click', async () => {
  const result = await window.api.checkCloudflared(elements.cloudflaredPath.value.trim());
  if (result.ok) {
    setCloudflaredStatus('cloudflared: ready', 'running');
    if (!elements.cloudflaredPath.value.trim() && result.path) {
      elements.cloudflaredPath.value = result.path;
    }
    appendLog(`cloudflared found: ${result.version || ''}\n`);
  } else {
    setCloudflaredStatus('cloudflared: missing', 'error');
    appendLog(`cloudflared check failed: ${result.error || ''}\n`);
  }
});

elements.installCloudflared.addEventListener('click', async () => {
  elements.installStatus.textContent = 'Install status: running...';
  const result = await window.api.installCloudflared({ requireChecksum: elements.requireChecksum.checked });
  if (result.ok) {
    if (result.path) {
      elements.cloudflaredPath.value = result.path;
    }
    setCloudflaredStatus('cloudflared: ready', 'running');
    elements.installStatus.textContent = 'Install status: complete.';
  } else {
    setCloudflaredStatus('cloudflared: error', 'error');
    elements.installStatus.textContent = `Install status: ${result.error || 'failed'}`;
  }
});

elements.browseCloudflared.addEventListener('click', async () => {
  const filePath = await window.api.pickCloudflaredPath();
  if (filePath) {
    elements.cloudflaredPath.value = filePath;
  }
});

elements.browseLog.addEventListener('click', async () => {
  const filePath = await window.api.pickLogFile(elements.logFile.value.trim());
  if (filePath) {
    elements.logFile.value = filePath;
  }
});

elements.openLogBtn.addEventListener('click', async () => {
  const logFile = elements.logFile.value.trim();
  if (!logFile) {
    appendLog('Open log failed: log file is not set.\n');
    return;
  }
  await window.api.openLog(logFile);
});

elements.openLogDirBtn.addEventListener('click', async () => {
  const logFile = elements.logFile.value.trim();
  if (!logFile) {
    appendLog('Open log folder failed: log file is not set.\n');
    return;
  }
  await window.api.openLogDir(logFile);
});

elements.openConfigBtn.addEventListener('click', async () => {
  await window.api.openConfigDir();
});

elements.importConfigBtn.addEventListener('click', async () => {
  const result = await window.api.importConfig();
  if (!result.ok) {
    appendLog(`Import failed: ${result.error || 'unknown error'}\n`);
    return;
  }
  applyConfig(result.config || {});
  appendLog('Config imported.\n');
});

elements.exportConfigBtn.addEventListener('click', async () => {
  const result = await window.api.exportConfig();
  if (!result.ok) {
    appendLog(`Export failed: ${result.error || 'unknown error'}\n`);
    return;
  }
  appendLog(`Config exported: ${result.path}\n`);
});

elements.clearLog.addEventListener('click', () => {
  logBuffer = [];
  elements.logOutput.textContent = '';
});

elements.openZeroTrust.addEventListener('click', async () => {
  if (!zeroTrustUrl) return;
  const result = await window.api.openExternal(zeroTrustUrl);
  if (result && result.ok === false) {
    appendLog(`Open verification failed: ${result.error || 'unknown error'}\n`);
  }
});

elements.saveLink.addEventListener('click', async () => {
  const hostname = elements.hostname.value.trim();
  const localBind = elements.localBind.value.trim();
  if (!hostname) {
    appendLog('Save link failed: hostname is required.\n');
    return;
  }
  const next = sanitizeSavedLinks([...savedLinks, { hostname, localBind }]);
  renderSavedLinks(next);
  await window.api.saveConfig({ savedLinks: next });
  appendLog('Saved link.\n');
});

elements.loadLink.addEventListener('click', () => {
  const index = parseInt(elements.savedLinks.value, 10);
  if (Number.isNaN(index) || !savedLinks[index]) {
    appendLog('Load link failed: select a saved link first.\n');
    return;
  }
  const link = savedLinks[index];
  elements.hostname.value = link.hostname;
  elements.localBind.value = link.localBind;
  appendLog('Loaded saved link.\n');
});

elements.deleteLink.addEventListener('click', async () => {
  const index = parseInt(elements.savedLinks.value, 10);
  if (Number.isNaN(index) || !savedLinks[index]) {
    appendLog('Delete link failed: select a saved link first.\n');
    return;
  }
  const next = savedLinks.filter((_item, idx) => idx !== index);
  renderSavedLinks(next);
  await window.api.saveConfig({ savedLinks: next });
  appendLog('Deleted saved link.\n');
});

elements.profileSelect.addEventListener('change', () => {
  const profile = getSelectedProfile();
  if (profile) {
    elements.profileName.value = profile.name;
  } else {
    elements.profileName.value = '';
  }
});

elements.saveProfile.addEventListener('click', async () => {
  const name = elements.profileName.value.trim();
  const config = collectConfig();
  if (!name) {
    appendLog('Save profile failed: profile name is required.\n');
    return;
  }
  if (!config.hostname || !config.logLevel || !config.logFile) {
    appendLog('Save profile failed: hostname, log level, and log file are required.\n');
    return;
  }

  const selected = getSelectedProfile();
  const id = selected ? selected.id : generateId();
  const nextProfiles = sanitizeProfiles([
    ...profiles.filter((profile) => profile.id !== id),
    {
      id,
      name,
      hostname: config.hostname,
      localBind: config.localBind,
      logLevel: config.logLevel,
      logFile: config.logFile,
      cloudflaredPath: config.cloudflaredPath
    }
  ]);

  activeProfileId = id;
  renderProfiles(nextProfiles, activeProfileId);
  await window.api.saveConfig({ profiles: nextProfiles, activeProfileId });
  appendLog('Profile saved.\n');
});

elements.loadProfile.addEventListener('click', async () => {
  const profile = getSelectedProfile();
  if (!profile) {
    appendLog('Load profile failed: select a profile first.\n');
    return;
  }
  elements.hostname.value = profile.hostname;
  elements.localBind.value = profile.localBind;
  elements.logLevel.value = profile.logLevel;
  elements.logFile.value = profile.logFile;
  elements.cloudflaredPath.value = profile.cloudflaredPath;
  activeProfileId = profile.id;
  await window.api.saveConfig({ activeProfileId });
  appendLog('Profile loaded.\n');
});

elements.deleteProfile.addEventListener('click', async () => {
  const profile = getSelectedProfile();
  if (!profile) {
    appendLog('Delete profile failed: select a profile first.\n');
    return;
  }
  const nextProfiles = profiles.filter((item) => item.id !== profile.id);
  if (activeProfileId === profile.id) {
    activeProfileId = '';
  }
  renderProfiles(nextProfiles, activeProfileId);
  await window.api.saveConfig({ profiles: nextProfiles, activeProfileId });
  appendLog('Profile deleted.\n');
});

elements.saveSettings.addEventListener('click', async () => {
  const settings = collectSettings();
  await window.api.saveConfig({ settings, activeProfileId });
  if (settings.autoStartTunnel && !activeProfileId) {
    appendLog('Warning: auto-start is enabled but no active profile is set.\n');
  }
  appendLog('Settings saved.\n');
});

init();
