const VALID_LOG_LEVELS = new Set(['auto', 'debug', 'info', 'warn', 'error']);

function splitListInput(input) {
  return String(input || '')
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseLocalBind(localBind) {
  const input = String(localBind || '').trim();
  if (!input) {
    return { ok: false, error: 'Local bind is required' };
  }

  let host = '';
  let portStr = '';

  if (input.startsWith('[')) {
    const end = input.indexOf(']');
    if (end === -1) {
      return { ok: false, error: 'Invalid IPv6 format in local bind' };
    }
    host = input.slice(1, end).trim();
    if (input[end + 1] !== ':') {
      return { ok: false, error: 'Local bind must include a port' };
    }
    portStr = input.slice(end + 2).trim();
  } else {
    const lastColon = input.lastIndexOf(':');
    if (lastColon <= 0) {
      return { ok: false, error: 'Local bind must be in host:port format' };
    }
    host = input.slice(0, lastColon).trim();
    portStr = input.slice(lastColon + 1).trim();
  }

  if (!host) {
    return { ok: false, error: 'Local bind host is required' };
  }

  if (/\s/.test(host)) {
    return { ok: false, error: 'Local bind host contains invalid whitespace' };
  }

  const port = Number(portStr);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { ok: false, error: 'Local bind port must be between 1 and 65535' };
  }

  return { ok: true, host, port };
}

function parseHostnames(hostnameInput) {
  const hostnames = splitListInput(hostnameInput);
  if (hostnames.length === 0) {
    return { ok: false, error: 'Hostname is required' };
  }

  const seen = new Set();
  for (const hostname of hostnames) {
    if (/\s/.test(hostname)) {
      return { ok: false, error: `Hostname "${hostname}" contains invalid whitespace` };
    }
    if (hostname.startsWith('http://') || hostname.startsWith('https://')) {
      return { ok: false, error: `Hostname "${hostname}" must not include a URL scheme` };
    }
    if (seen.has(hostname)) {
      return { ok: false, error: `Hostname "${hostname}" is duplicated` };
    }
    seen.add(hostname);
  }

  return { ok: true, hostnames };
}

function parseLocalBindList(localBindInput) {
  const items = splitListInput(localBindInput);
  if (items.length === 0) {
    return { ok: true, binds: [] };
  }

  const binds = [];
  const seen = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const parsed = parseLocalBind(items[i]);
    if (!parsed.ok) {
      return { ok: false, error: `Local bind #${i + 1}: ${parsed.error}` };
    }
    const key = `${parsed.host}|${parsed.port}`;
    if (seen.has(key)) {
      return { ok: false, error: `Local bind "${items[i]}" is duplicated` };
    }
    seen.add(key);
    binds.push(parsed);
  }

  return { ok: true, binds };
}

function formatLocalBind(bind) {
  const host = String(bind && bind.host ? bind.host : '').trim();
  const port = Number(bind && bind.port);
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) {
    return '';
  }
  if (host.includes(':') && !host.startsWith('[') && !host.endsWith(']')) {
    return `[${host}]:${port}`;
  }
  return `${host}:${port}`;
}

function validateConfig(config) {
  const hostnameResult = parseHostnames(config.hostname);
  const logLevel = String(config.logLevel || '').trim();
  const logFile = String(config.logFile || '').trim();

  if (!hostnameResult.ok) {
    return hostnameResult;
  }

  const bindResult = parseLocalBindList(config.localBind);
  if (!bindResult.ok) {
    return bindResult;
  }
  if (bindResult.binds.length > hostnameResult.hostnames.length) {
    return { ok: false, error: 'Local bind count must not exceed hostname count' };
  }

  if (!logLevel || !VALID_LOG_LEVELS.has(logLevel)) {
    return { ok: false, error: 'Log level must be one of auto, debug, info, warn, error' };
  }

  if (!logFile) {
    return { ok: false, error: 'Log file is required' };
  }

  return {
    ok: true,
    hostnames: hostnameResult.hostnames,
    binds: bindResult.binds
  };
}

module.exports = {
  parseHostnames,
  parseLocalBindList,
  parseLocalBind,
  formatLocalBind,
  validateConfig
};
