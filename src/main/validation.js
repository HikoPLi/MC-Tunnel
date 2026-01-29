const VALID_LOG_LEVELS = new Set(['auto', 'debug', 'info', 'warn', 'error']);

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

function validateConfig(config) {
  const hostname = String(config.hostname || '').trim();
  const logLevel = String(config.logLevel || '').trim();
  const logFile = String(config.logFile || '').trim();

  if (!hostname) {
    return { ok: false, error: 'Hostname is required' };
  }
  if (/\s/.test(hostname)) {
    return { ok: false, error: 'Hostname contains invalid whitespace' };
  }
  if (hostname.startsWith('http://') || hostname.startsWith('https://')) {
    return { ok: false, error: 'Hostname must not include a URL scheme' };
  }

  const bind = parseLocalBind(config.localBind);
  if (!bind.ok) {
    return bind;
  }

  if (!logLevel || !VALID_LOG_LEVELS.has(logLevel)) {
    return { ok: false, error: 'Log level must be one of auto, debug, info, warn, error' };
  }

  if (!logFile) {
    return { ok: false, error: 'Log file is required' };
  }

  return { ok: true, bind };
}

module.exports = {
  parseLocalBind,
  validateConfig
};
