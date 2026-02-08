const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_SETTINGS = {
  checkPortOnStart: true,
  rotateLogs: true,
  maxLogSizeMB: 5,
  maxLogBackups: 3,
  requireChecksum: true,
  autoStartTunnel: false,
  autoOpenZeroTrust: true,
  allowPortKill: false
};

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

function createId() {
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
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

function sanitizeProfiles(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const cleaned = [];
  list.forEach((item) => {
    if (!item) return;
    const id = String(item.id || '').trim() || createId();
    if (seen.has(id)) return;
    seen.add(id);
    const name = String(item.name || '').trim() || 'Unnamed profile';
    const hostname = String(item.hostname || '').trim();
    const localBind = String(item.localBind || '').trim();
    const logLevel = String(item.logLevel || '').trim() || 'auto';
    const logFile = String(item.logFile || '').trim() || getDefaultLogFile();
    const cloudflaredPath = String(item.cloudflaredPath || '').trim();
    cleaned.push({
      id,
      name,
      hostname,
      localBind,
      logLevel,
      logFile,
      cloudflaredPath
    });
  });
  return cleaned;
}

function normalizeConfig(raw) {
  const settings = { ...DEFAULT_SETTINGS, ...(raw.settings || {}) };
  const savedLinks = sanitizeSavedLinks(raw.savedLinks || raw.links || []);
  let profiles = sanitizeProfiles(raw.profiles || []);

  if (profiles.length === 0) {
    const hasLegacy = raw.hostname || raw.localBind || raw.logLevel || raw.logFile || raw.cloudflaredPath;
    if (hasLegacy) {
      profiles = sanitizeProfiles([
        {
          id: createId(),
          name: 'Migrated profile',
          hostname: raw.hostname,
          localBind: raw.localBind,
          logLevel: raw.logLevel,
          logFile: raw.logFile,
          cloudflaredPath: raw.cloudflaredPath
        }
      ]);
    }
  }

  const activeProfileId = typeof raw.activeProfileId === 'string' ? raw.activeProfileId : '';
  const activeExists = profiles.some((profile) => profile.id === activeProfileId);

  return {
    savedLinks,
    profiles,
    activeProfileId: activeExists ? activeProfileId : '',
    settings
  };
}

function getDefaults() {
  return normalizeConfig({});
}

function loadConfig() {
  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    return getDefaults();
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed);
  } catch (err) {
    const badPath = configPath + '.bad';
    try {
      fs.renameSync(configPath, badPath);
    } catch (_) {
      // ignore rename errors
    }
    return getDefaults();
  }
}

function saveConfig(partial) {
  const current = loadConfig();
  const merged = {
    ...current,
    ...partial,
    settings: {
      ...current.settings,
      ...(partial.settings || {})
    }
  };
  const next = normalizeConfig(merged);
  const configPath = getConfigPath();
  ensureDir(path.dirname(configPath));
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2));
  return next;
}

module.exports = {
  getDefaults,
  getConfigPath,
  getDefaultLogFile,
  loadConfig,
  saveConfig
};
