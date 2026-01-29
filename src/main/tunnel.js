const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { extractZeroTrustUrls } = require('./zerotrust');

let tunnelProcess = null;
let logStream = null;

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

function buildArgs(config) {
  const args = [
    'access',
    'tcp',
    '--hostname',
    config.hostname,
    '--url',
    config.localBind
  ];
  const level = String(config.logLevel || '').trim();
  if (level && level !== 'auto') {
    args.push('--loglevel', level);
  }
  return args;
}

function writeHeader(config) {
  if (!logStream) return;
  const lines = [
    '===== ' + new Date().toISOString() + ' =====',
    `[*] Hostname: ${config.hostname}`,
    `[*] Local   : ${config.localBind}`,
    `[*] Log     : ${config.logFile}`,
    ''
  ];
  logStream.write(lines.join('\n') + '\n');
}

function startTunnel(config, handlers) {
  if (tunnelProcess) {
    return { ok: false, error: 'Tunnel is already running' };
  }

  if (!config.hostname || !config.localBind || !config.logLevel || !config.logFile) {
    return { ok: false, error: 'Hostname, local bind, log level, and log file are required' };
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

  const logDir = path.dirname(config.logFile);
  ensureDir(logDir);
  rotateLogIfNeeded(config.logFile, config.settings);
  logStream = fs.createWriteStream(config.logFile, { flags: 'a' });
  writeHeader(config);

  let authBuffer = '';
  const authUrls = new Set();
  const maxAuthBuffer = 4096;

  const handleAuthUrls = (text) => {
    if (!handlers || !handlers.onAuthUrl) return;
    authBuffer = (authBuffer + text).slice(-maxAuthBuffer);
    const found = extractZeroTrustUrls(authBuffer);
    found.forEach((url) => {
      if (authUrls.has(url)) return;
      authUrls.add(url);
      handlers.onAuthUrl(url);
    });
  };

  const args = buildArgs(config);
  const proc = spawn(exePath, args, { windowsHide: true });
  tunnelProcess = proc;

  const onData = (chunk) => {
    const text = chunk.toString();
    handleAuthUrls(text);
    if (logStream) logStream.write(text);
    if (handlers && handlers.onLog) handlers.onLog(text);
  };

  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('error', (err) => {
    if (handlers && handlers.onLog) handlers.onLog(`Process error: ${err.message}\n`);
    if (handlers && handlers.onExit) handlers.onExit({ code: null, signal: 'error', error: err.message });
    cleanup();
  });

  proc.on('close', (code, signal) => {
    if (handlers && handlers.onExit) handlers.onExit({ code, signal });
    cleanup();
  });

  return { ok: true, pid: proc.pid };
}

function cleanup() {
  tunnelProcess = null;
  if (logStream) {
    logStream.end();
    logStream = null;
  }
}

function stopTunnel() {
  if (!tunnelProcess) {
    return { ok: false, error: 'Tunnel is not running' };
  }

  const pid = tunnelProcess.pid;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
  } else {
    tunnelProcess.kill('SIGTERM');
  }

  return { ok: true };
}

function isRunning() {
  return Boolean(tunnelProcess);
}

module.exports = {
  startTunnel,
  stopTunnel,
  isRunning
};
