const elements = {
  hostname: document.getElementById('hostname'),
  localBind: document.getElementById('localBind'),
  logLevel: document.getElementById('logLevel'),
  logFile: document.getElementById('logFile'),
  savedLinks: document.getElementById('savedLinks'),
  saveLink: document.getElementById('saveLink'),
  loadLink: document.getElementById('loadLink'),
  deleteLink: document.getElementById('deleteLink'),
  cloudflaredPath: document.getElementById('cloudflaredPath'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  saveBtn: document.getElementById('saveBtn'),
  browseLog: document.getElementById('browseLog'),
  browseCloudflared: document.getElementById('browseCloudflared'),
  checkCloudflared: document.getElementById('checkCloudflared'),
  installCloudflared: document.getElementById('installCloudflared'),
  installStatus: document.getElementById('installStatus'),
  openLogBtn: document.getElementById('openLogBtn'),
  openLogDirBtn: document.getElementById('openLogDirBtn'),
  clearLog: document.getElementById('clearLog'),
  tunnelStatus: document.getElementById('tunnelStatus'),
  cloudflaredStatus: document.getElementById('cloudflaredStatus'),
  logOutput: document.getElementById('logOutput')
};

let logBuffer = [];
let savedLinks = [];

function applyConfig(config) {
  elements.hostname.value = config.hostname || '';
  elements.localBind.value = config.localBind || '';
  elements.logLevel.value = config.logLevel || '';
  elements.logFile.value = config.logFile || '';
  elements.cloudflaredPath.value = config.cloudflaredPath || '';
  renderSavedLinks(config.savedLinks || []);
}

function collectConfig() {
  return {
    hostname: elements.hostname.value.trim(),
    localBind: elements.localBind.value.trim(),
    logLevel: elements.logLevel.value,
    logFile: elements.logFile.value.trim(),
    cloudflaredPath: elements.cloudflaredPath.value.trim()
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
  elements.startBtn.disabled = isRunning;
  elements.stopBtn.disabled = !isRunning;
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

function sanitizeSavedLinks(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const cleaned = [];
  list.forEach((item) => {
    if (!item) return;
    const hostname = String(item.hostname || '').trim();
    const localBind = String(item.localBind || '').trim();
    if (!hostname || !localBind) return;
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
    opt.textContent = `${link.hostname} -> ${link.localBind}`;
    elements.savedLinks.appendChild(opt);
  });
}

async function init() {
  const config = await window.api.loadConfig();
  applyConfig(config);
  setTunnelStatus('Tunnel: idle', 'idle');
  setRunningState(false);

  const cloudflared = await window.api.checkCloudflared();
  if (cloudflared.ok) {
    setCloudflaredStatus('cloudflared: ready', 'running');
  } else {
    setCloudflaredStatus('cloudflared: missing', 'error');
  }
}

window.api.onLog((line) => appendLog(line));
window.api.onStatus((status) => {
  if (status.running) {
    setTunnelStatus('Tunnel: running', 'running');
    setRunningState(true);
  } else {
    setTunnelStatus('Tunnel: stopped', status.error ? 'error' : 'idle');
    setRunningState(false);
  }
});

window.api.onInstallLog((message) => {
  if (message) {
    elements.installStatus.textContent = `Install status: ${message}`;
  }
});

elements.saveBtn.addEventListener('click', async () => {
  const config = collectConfig();
  await window.api.saveConfig(config);
  elements.installStatus.textContent = 'Install status: config saved.';
});

elements.startBtn.addEventListener('click', async () => {
  const config = collectConfig();
  if (!config.hostname || !config.localBind || !config.logLevel || !config.logFile) {
    appendLog('Start failed: hostname, local bind, log level, and log file are required.\n');
    setTunnelStatus('Tunnel: error', 'error');
    return;
  }
  const result = await window.api.startTunnel(config);
  if (!result.ok) {
    appendLog(`Start failed: ${result.error || 'unknown error'}\n`);
    setTunnelStatus('Tunnel: error', 'error');
  }
});

elements.stopBtn.addEventListener('click', async () => {
  const result = await window.api.stopTunnel();
  if (!result.ok) {
    appendLog(`Stop failed: ${result.error || 'unknown error'}\n`);
  }
});

elements.checkCloudflared.addEventListener('click', async () => {
  const result = await window.api.checkCloudflared();
  if (result.ok) {
    setCloudflaredStatus('cloudflared: ready', 'running');
    appendLog(`cloudflared found: ${result.version || ''}\n`);
  } else {
    setCloudflaredStatus('cloudflared: missing', 'error');
    appendLog(`cloudflared check failed: ${result.error || ''}\n`);
  }
});

elements.installCloudflared.addEventListener('click', async () => {
  elements.installStatus.textContent = 'Install status: running...';
  const result = await window.api.installCloudflared();
  if (result.ok) {
    elements.cloudflaredPath.value = result.path || elements.cloudflaredPath.value;
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
  const filePath = await window.api.pickLogFile();
  if (filePath) {
    elements.logFile.value = filePath;
  }
});

elements.openLogBtn.addEventListener('click', async () => {
  if (!elements.logFile.value.trim()) {
    appendLog('Open log failed: log file is not set.\n');
    return;
  }
  await window.api.openLog();
});

elements.openLogDirBtn.addEventListener('click', async () => {
  if (!elements.logFile.value.trim()) {
    appendLog('Open log folder failed: log file is not set.\n');
    return;
  }
  await window.api.openLogDir();
});

elements.clearLog.addEventListener('click', () => {
  logBuffer = [];
  elements.logOutput.textContent = '';
});

elements.saveLink.addEventListener('click', async () => {
  const config = collectConfig();
  if (!config.hostname || !config.localBind) {
    appendLog('Save link failed: hostname and local bind are required.\n');
    return;
  }
  const next = sanitizeSavedLinks([...savedLinks, { hostname: config.hostname, localBind: config.localBind }]);
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

init();
