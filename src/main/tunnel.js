const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

let tunnelProcess = null;
let logStream = null;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function buildArgs(config) {
  return [
    'access',
    'tcp',
    '--hostname',
    config.hostname,
    '--url',
    config.localBind,
    '--loglevel',
    config.logLevel
  ];
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

  const exePath = config.cloudflaredPath && config.cloudflaredPath.trim()
    ? config.cloudflaredPath.trim()
    : 'cloudflared';

  const logDir = path.dirname(config.logFile);
  ensureDir(logDir);
  logStream = fs.createWriteStream(config.logFile, { flags: 'a' });
  writeHeader(config);

  const args = buildArgs(config);
  const proc = spawn(exePath, args, { windowsHide: true });
  tunnelProcess = proc;

  const onData = (chunk) => {
    const text = chunk.toString();
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
