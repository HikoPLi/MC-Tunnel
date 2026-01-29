const { app } = require('electron');
const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

function getDefaultLogFile() {
  const logDir = path.join(app.getPath('userData'), 'logs');
  ensureDir(logDir);
  return path.join(logDir, 'cloudflared-mc-tunnel.log');
}

function getDefaults() {
  return {
    hostname: '',
    localBind: '',
    logLevel: '',
    logFile: '',
    cloudflaredPath: '',
    autoStart: false,
    savedLinks: []
  };
}

function loadConfig() {
  const defaults = getDefaults();
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return defaults;
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...defaults, ...parsed };
  } catch (err) {
    const badPath = configPath + '.bad';
    try {
      fs.renameSync(configPath, badPath);
    } catch (_) {
      // ignore rename errors
    }
    return defaults;
  }
}

function saveConfig(partial) {
  const current = loadConfig();
  const next = { ...current, ...partial };
  if (!Array.isArray(next.savedLinks)) {
    next.savedLinks = [];
  }
  const configPath = getConfigPath();
  ensureDir(path.dirname(configPath));
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
  return next;
}

module.exports = {
  getDefaults,
  getConfigPath,
  loadConfig,
  saveConfig,
  getDefaultLogFile
};
