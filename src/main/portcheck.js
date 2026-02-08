const net = require('net');

function checkPort(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      try {
        server.close(() => resolve(result));
      } catch (_) {
        resolve(result);
      }
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: 'Port check timed out' });
    }, timeoutMs);

    server.once('error', (err) => {
      clearTimeout(timer);
      if (err && err.code === 'EADDRINUSE') {
        finish({ ok: false, error: 'Port is already in use', code: err.code });
        return;
      }
      finish({ ok: false, error: err ? err.message : 'Port check failed', code: err && err.code });
    });

    server.listen(port, host, () => {
      clearTimeout(timer);
      finish({ ok: true });
    });
  });
}

function pickFreePort(host = '127.0.0.1', timeoutMs = 1500) {
  return new Promise((resolve) => {
    const server = net.createServer();
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        server.close(() => resolve({ ok: false, error: 'Auto-assign local bind timed out' }));
      } catch (_) {
        resolve({ ok: false, error: 'Auto-assign local bind timed out' });
      }
    }, timeoutMs);

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    server.once('error', (err) => {
      finish({
        ok: false,
        error: err ? err.message : 'Failed to auto-assign local bind',
        code: err && err.code
      });
    });

    server.listen(0, host, () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? Number(address.port) : 0;
      server.close(() => {
        if (!Number.isInteger(port) || port <= 0 || port > 65535) {
          finish({ ok: false, error: 'Failed to auto-assign local bind' });
          return;
        }
        finish({ ok: true, host, port });
      });
    });
  });
}

module.exports = {
  checkPort,
  pickFreePort
};
