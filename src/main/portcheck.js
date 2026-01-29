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

module.exports = {
  checkPort
};