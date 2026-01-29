const { spawn } = require('child_process');

function runCommand(command, args) {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err) => {
      resolve({ ok: false, error: err.message, stdout, stderr, code: null });
    });

    proc.on('close', (code) => {
      resolve({ ok: code === 0, code, stdout, stderr, error: code === 0 ? null : `Exit code ${code}` });
    });
  });
}

function parsePortFromAddress(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('[')) {
    const end = trimmed.indexOf(']');
    if (end === -1) return null;
    if (trimmed[end + 1] !== ':') return null;
    const portStr = trimmed.slice(end + 2);
    const port = Number(portStr);
    return Number.isInteger(port) ? port : null;
  }
  const idx = trimmed.lastIndexOf(':');
  if (idx === -1) return null;
  const portStr = trimmed.slice(idx + 1);
  const port = Number(portStr);
  return Number.isInteger(port) ? port : null;
}

function parseWindowsNetstat(output, port) {
  const pids = new Set();
  const lines = String(output || '').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('TCP')) return;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) return;
    const state = parts[3];
    if (state !== 'LISTENING') return;
    const localPort = parsePortFromAddress(parts[1]);
    if (localPort !== port) return;
    const pid = Number(parts[4]);
    if (Number.isInteger(pid)) {
      pids.add(pid);
    }
  });
  return Array.from(pids);
}

function parseLsof(output) {
  const entries = [];
  const lines = String(output || '').split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return entries;
  lines.slice(1).forEach((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) return;
    const name = parts[0];
    const pid = Number(parts[1]);
    if (Number.isInteger(pid)) {
      entries.push({ pid, name });
    }
  });
  return entries;
}

function parseSs(output) {
  const entries = [];
  const lines = String(output || '').split(/\r?\n/).filter(Boolean);
  lines.forEach((line) => {
    const pidMatches = Array.from(line.matchAll(/pid=(\d+)/g));
    if (pidMatches.length === 0) return;
    const nameMatches = Array.from(line.matchAll(/"([^"]+)"/g)).map((match) => match[1]);
    pidMatches.forEach((match, index) => {
      const pid = Number(match[1]);
      if (Number.isInteger(pid)) {
        entries.push({ pid, name: nameMatches[index] || '' });
      }
    });
  });
  return entries;
}

function parseUnixNetstat(output, port) {
  const entries = [];
  const lines = String(output || '').split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('tcp')) return;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 7) return;
    const localPort = parsePortFromAddress(parts[3]);
    if (localPort !== port) return;
    const pidField = parts[6];
    if (!pidField || pidField === '-') return;
    const pidStr = pidField.split('/')[0];
    const pid = Number(pidStr);
    if (Number.isInteger(pid)) {
      const name = pidField.includes('/') ? pidField.split('/')[1] : '';
      entries.push({ pid, name: name || '' });
    }
  });
  return entries;
}

async function getProcessName(pid) {
  if (process.platform === 'win32') {
    const result = await runCommand('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH']);
    if (!result.ok) return '';
    const line = String(result.stdout || '').trim();
    if (!line) return '';
    const match = line.match(/^"([^"]+)"/);
    return match ? match[1] : '';
  }

  const result = await runCommand('ps', ['-p', String(pid), '-o', 'comm=']);
  if (!result.ok) return '';
  return String(result.stdout || '').trim();
}

async function findPortOwners(port) {
  const targetPort = Number(port);
  if (!Number.isInteger(targetPort)) {
    return { ok: false, error: 'Invalid port' };
  }

  if (process.platform === 'win32') {
    const netstat = await runCommand('netstat', ['-ano', '-p', 'tcp']);
    if (!netstat.ok) {
      return { ok: false, error: 'Failed to run netstat' };
    }
    const pids = parseWindowsNetstat(netstat.stdout, targetPort);
    const entries = [];
    for (const pid of pids) {
      const name = await getProcessName(pid);
      entries.push({ pid, name });
    }
    return { ok: true, entries };
  }

  const lsof = await runCommand('lsof', ['-nP', `-iTCP:${targetPort}`, '-sTCP:LISTEN']);
  if (lsof.ok) {
    const entries = parseLsof(lsof.stdout);
    return { ok: true, entries };
  }

  const ss = await runCommand('ss', ['-ltnp', `sport = :${targetPort}`]);
  if (ss.ok) {
    const entries = parseSs(ss.stdout);
    return { ok: true, entries };
  }

  const netstat = await runCommand('netstat', ['-anp', 'tcp']);
  if (netstat.ok) {
    const entries = parseUnixNetstat(netstat.stdout, targetPort);
    return { ok: true, entries };
  }

  return { ok: false, error: 'Unable to detect process using this port' };
}

async function killProcess(pid) {
  const target = Number(pid);
  if (!Number.isInteger(target)) return { ok: false, error: 'Invalid PID' };

  if (process.platform === 'win32') {
    const result = await runCommand('taskkill', ['/PID', String(target), '/T', '/F']);
    if (!result.ok) {
      return { ok: false, error: 'taskkill failed' };
    }
    return { ok: true };
  }

  try {
    process.kill(target, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 800));
    try {
      process.kill(target, 0);
      process.kill(target, 'SIGKILL');
    } catch (_) {
      // process already exited
    }
  } catch (err) {
    return { ok: false, error: err.message };
  }

  return { ok: true };
}

async function killPortOwners(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, error: 'No process owners found for this port' };
  }
  const failures = [];
  for (const entry of entries) {
    const result = await killProcess(entry.pid);
    if (!result.ok) {
      failures.push(`PID ${entry.pid}: ${result.error}`);
    }
  }
  if (failures.length > 0) {
    return { ok: false, error: failures.join('; ') };
  }
  return { ok: true };
}

module.exports = {
  findPortOwners,
  killPortOwners
};
