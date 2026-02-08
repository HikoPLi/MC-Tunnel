const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { extractZeroTrustUrls } = require('./zerotrust');
const { formatLocalBind } = require('./validation');

let runtimeConfig = null;
let lifecycleHandlers = null;
let connections = [];
let logStream = null;
let authBuffer = '';
let authUrls = new Set();
let allStoppedNotified = false;
let nextConnectionId = 1;

function rotateLogIfNeeded(logFile, settings) {
  if (!settings || !settings.rotateLogs) return;
  const maxSizeMB = Number(settings.maxLogSizeMB || 0);
  const maxBackups = Number(settings.maxLogBackups || 0);
  if (!maxSizeMB || maxSizeMB <= 0 || !maxBackups || maxBackups <= 0) return;

  if (!fs.existsSync(logFile)) return;
  const stats = fs.statSync(logFile);
  if (stats.size <= maxSizeMB * 1024 * 1024) return;

  for (let i = maxBackups; i >= 1; i -= 1) {
    const src = i === 1 ? logFile : `${logFile}.${i - 1}`;
    const dest = `${logFile}.${i}`;
    if (fs.existsSync(src)) {
      try {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        fs.renameSync(src, dest);
      } catch (_) {
        // ignore rotation errors
      }
    }
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function isRunning() {
  return connections.some((item) => item.running);
}

function hasRuntime() {
  return Boolean(runtimeConfig);
}

function listConnections() {
  return connections.map((item) => ({
    id: item.id,
    hostname: item.hostname,
    localBind: item.localBind,
    autoAssigned: Boolean(item.autoAssigned),
    running: Boolean(item.running),
    pid: item.pid || null,
    startedAt: item.startedAt || '',
    lastExitCode: Number.isInteger(item.lastExitCode) ? item.lastExitCode : null,
    lastExitSignal: item.lastExitSignal || '',
    lastError: item.lastError || ''
  }));
}

function emitConnections() {
  if (!lifecycleHandlers || !lifecycleHandlers.onConnections) return;
  lifecycleHandlers.onConnections(listConnections());
}

function buildArgs(target, logLevel) {
  const args = [
    'access',
    'tcp',
    '--hostname',
    target.hostname,
    '--url',
    target.localBind
  ];
  const level = String(logLevel || '').trim();
  if (level && level !== 'auto') {
    args.push('--loglevel', level);
  }
  return args;
}

function writeHeader(config) {
  if (!logStream) return;
  const targets = Array.isArray(config.targets) ? config.targets : [];
  const lines = [
    '===== ' + new Date().toISOString() + ' =====',
    `[*] Connections: ${targets.length}`,
    ...targets.map((target, index) => {
      const suffix = target.autoAssigned ? ' (auto)' : '';
      return `[*] ${index + 1}. ${target.hostname} -> ${target.localBind}${suffix}`;
    }),
    `[*] Log     : ${config.logFile}`,
    ''
  ];
  logStream.write(lines.join('\n') + '\n');
}

function writeEventLine(text) {
  if (!logStream) return;
  logStream.write(`[${new Date().toISOString()}] ${text}\n`);
}

function openLogStreamIfNeeded() {
  if (logStream || !runtimeConfig || !runtimeConfig.logFile) return;
  const logFile = runtimeConfig.logFile;
  const logDir = path.dirname(logFile);
  ensureDir(logDir);
  rotateLogIfNeeded(logFile, runtimeConfig.settings);
  logStream = fs.createWriteStream(logFile, { flags: 'a' });
}

function closeLogStream() {
  if (!logStream) return;
  logStream.end();
  logStream = null;
}

function prefixLines(text, prefix) {
  const lines = String(text || '').split('\n');
  return lines
    .map((line) => (line ? `[${prefix}] ${line}` : line))
    .join('\n');
}

function resetRuntimeState() {
  runtimeConfig = null;
  lifecycleHandlers = null;
  connections = [];
  authBuffer = '';
  authUrls = new Set();
  allStoppedNotified = false;
  closeLogStream();
}

function connectionKey(item) {
  if (!item || !item.hostname || !item.localBind) return '';
  return `${item.hostname}|${item.localBind}`;
}

function createConnectionRecord(target) {
  return {
    id: `c-${nextConnectionId++}`,
    hostname: target.hostname,
    localBind: target.localBind,
    host: target.host,
    port: target.port,
    autoAssigned: Boolean(target.autoAssigned),
    proc: null,
    running: false,
    pid: null,
    startedAt: '',
    lastExitCode: null,
    lastExitSignal: '',
    lastError: ''
  };
}

function handleAuthUrls(text) {
  if (!lifecycleHandlers || !lifecycleHandlers.onAuthUrl) return;
  authBuffer = (authBuffer + text).slice(-4096);
  const found = extractZeroTrustUrls(authBuffer);
  found.forEach((url) => {
    if (authUrls.has(url)) return;
    authUrls.add(url);
    lifecycleHandlers.onAuthUrl(url);
  });
}

function notifyAllStopped(info) {
  if (allStoppedNotified || isRunning()) return;
  allStoppedNotified = true;
  closeLogStream();
  if (lifecycleHandlers && lifecycleHandlers.onExit) {
    lifecycleHandlers.onExit(info || {});
  }
}

function spawnConnection(connection) {
  if (!runtimeConfig) {
    return { ok: false, error: 'Tunnel is not configured' };
  }
  if (connection.running) {
    return { ok: false, error: 'Connection is already running' };
  }

  openLogStreamIfNeeded();
  allStoppedNotified = false;

  const args = buildArgs(connection, runtimeConfig.logLevel);
  const proc = spawn(runtimeConfig.exePath, args, { windowsHide: true });

  connection.proc = proc;
  connection.running = true;
  connection.pid = Number.isInteger(proc.pid) ? proc.pid : null;
  connection.startedAt = new Date().toISOString();
  connection.lastExitCode = null;
  connection.lastExitSignal = '';
  connection.lastError = '';

  writeEventLine(`Connection start: ${connection.hostname} -> ${connection.localBind}`);
  emitConnections();

  const usePrefix = connections.length > 1 ? connection.hostname : '';
  const onData = (chunk) => {
    const text = chunk.toString();
    handleAuthUrls(text);
    const rendered = usePrefix ? prefixLines(text, usePrefix) : text;
    if (logStream) logStream.write(rendered);
    if (lifecycleHandlers && lifecycleHandlers.onLog) {
      lifecycleHandlers.onLog(rendered);
    }
  };

  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('error', (err) => {
    connection.running = false;
    connection.proc = null;
    connection.pid = null;
    connection.lastError = err && err.message ? err.message : 'Process error';
    writeEventLine(`Connection error: ${connection.hostname} -> ${connection.lastError}`);
    if (lifecycleHandlers && lifecycleHandlers.onLog) {
      lifecycleHandlers.onLog(`Process error (${connection.hostname}): ${connection.lastError}\n`);
    }
    emitConnections();
    notifyAllStopped({
      code: null,
      signal: 'error',
      error: connection.lastError,
      hostname: connection.hostname,
      connectionId: connection.id
    });
  });

  proc.on('close', (code, signal) => {
    connection.running = false;
    connection.proc = null;
    connection.pid = null;
    connection.lastExitCode = Number.isInteger(code) ? code : null;
    connection.lastExitSignal = signal || '';
    const bindInfo = formatLocalBind(connection);
    const closedLine = `Connection closed: ${connection.hostname} -> ${bindInfo || connection.localBind} (code=${code}, signal=${signal || 'none'})`;
    writeEventLine(closedLine);
    if (lifecycleHandlers && lifecycleHandlers.onLog) {
      lifecycleHandlers.onLog(`${closedLine}\n`);
    }
    emitConnections();
    notifyAllStopped({
      code,
      signal,
      hostname: connection.hostname,
      connectionId: connection.id
    });
  });

  return { ok: true, pid: connection.pid };
}

function startTunnel(config, handlers) {
  const targets = Array.isArray(config.targets) ? config.targets.filter((item) => item && item.hostname && item.localBind) : [];
  if (targets.length === 0 || !config.logLevel || !config.logFile) {
    return { ok: false, error: 'At least one hostname, log level, and log file are required' };
  }

  try {
    if (fs.existsSync(config.logFile) && fs.statSync(config.logFile).isDirectory()) {
      return { ok: false, error: 'Log file path points to a directory' };
    }
  } catch (_) {
    // ignore stat errors and let the stream fail if needed
  }

  const exePath = config.cloudflaredPath && config.cloudflaredPath.trim()
    ? config.cloudflaredPath.trim()
    : 'cloudflared';

  if (hasRuntime() && !isRunning()) {
    resetRuntimeState();
  }

  const isAppending = hasRuntime();
  if (!isAppending) {
    runtimeConfig = {
      exePath,
      logLevel: config.logLevel,
      logFile: config.logFile,
      settings: config.settings || {}
    };
    lifecycleHandlers = handlers || null;
    connections = [];
    openLogStreamIfNeeded();
    writeHeader({ ...config, targets });
  } else {
    if (runtimeConfig.exePath !== exePath) {
      return { ok: false, error: 'Tunnel is already running with a different cloudflared binary. Stop all connections before switching binary.' };
    }
    if (runtimeConfig.logFile !== config.logFile) {
      return { ok: false, error: 'Tunnel is already running with a different log file. Stop all connections before switching log file.' };
    }
    if (runtimeConfig.logLevel !== config.logLevel) {
      return { ok: false, error: 'Tunnel is already running with a different log level. Stop all connections before changing log level.' };
    }
    runtimeConfig.settings = config.settings || runtimeConfig.settings;
    lifecycleHandlers = handlers || lifecycleHandlers;
    openLogStreamIfNeeded();
  }

  const pids = [];

  targets.forEach((target) => {
    const key = connectionKey(target);
    const existing = key ? connections.find((item) => connectionKey(item) === key) : null;
    if (existing) {
      if (existing.running) return;
      const restarted = spawnConnection(existing);
      if (restarted.ok && Number.isInteger(restarted.pid)) {
        pids.push(restarted.pid);
      }
      return;
    }

    const connection = createConnectionRecord(target);
    connections.push(connection);
    const started = spawnConnection(connection);
    if (started.ok && Number.isInteger(started.pid)) {
      pids.push(started.pid);
    }
  });

  return {
    ok: true,
    pids,
    targets: connections.map((connection) => ({
      hostname: connection.hostname,
      localBind: connection.localBind,
      autoAssigned: Boolean(connection.autoAssigned)
    })),
    connections: listConnections()
  };
}

function startConnection(connectionId) {
  const connection = connections.find((item) => item.id === connectionId);
  if (!connection) {
    return { ok: false, error: 'Connection not found' };
  }
  const started = spawnConnection(connection);
  if (!started.ok) return started;
  return { ok: true, connection: listConnections().find((item) => item.id === connectionId) || null };
}

function stopConnection(connectionId) {
  const connection = connections.find((item) => item.id === connectionId);
  if (!connection) {
    return { ok: false, error: 'Connection not found' };
  }
  if (!connection.running || !connection.proc || !connection.proc.pid) {
    return { ok: false, error: 'Connection is not running' };
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(connection.proc.pid), '/T', '/F'], { windowsHide: true });
  } else {
    connection.proc.kill('SIGTERM');
  }
  return { ok: true };
}

function stopTunnel() {
  const running = connections.filter((item) => item.running && item.proc && item.proc.pid);
  if (running.length === 0) {
    return { ok: false, error: 'Tunnel is not running' };
  }

  running.forEach((connection) => {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(connection.proc.pid), '/T', '/F'], { windowsHide: true });
    } else {
      connection.proc.kill('SIGTERM');
    }
  });

  return { ok: true };
}

module.exports = {
  listConnections,
  startConnection,
  startTunnel,
  stopConnection,
  stopTunnel,
  isRunning
};
