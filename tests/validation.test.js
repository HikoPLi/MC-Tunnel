const assert = require('assert');
const {
  parseHostnames,
  parseLocalBindList,
  parseLocalBind,
  formatLocalBind,
  validateConfig
} = require('../src/main/validation');

function testParseHostnames() {
  const ok = parseHostnames('mc-a.example.com, mc-b.example.com');
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(ok.hostnames, ['mc-a.example.com', 'mc-b.example.com']);

  const duplicated = parseHostnames('mc-a.example.com,mc-a.example.com');
  assert.strictEqual(duplicated.ok, false);

  const scheme = parseHostnames('https://mc.example.com');
  assert.strictEqual(scheme.ok, false);
}

function testParseLocalBind() {
  const ipv4 = parseLocalBind('127.0.0.1:25566');
  assert.strictEqual(ipv4.ok, true);
  assert.strictEqual(ipv4.host, '127.0.0.1');
  assert.strictEqual(ipv4.port, 25566);

  const ipv6 = parseLocalBind('[::1]:25566');
  assert.strictEqual(ipv6.ok, true);
  assert.strictEqual(ipv6.host, '::1');
  assert.strictEqual(ipv6.port, 25566);

  const missingPort = parseLocalBind('localhost');
  assert.strictEqual(missingPort.ok, false);

  const badPort = parseLocalBind('localhost:0');
  assert.strictEqual(badPort.ok, false);
}

function testParseLocalBindList() {
  const empty = parseLocalBindList('');
  assert.strictEqual(empty.ok, true);
  assert.deepStrictEqual(empty.binds, []);

  const multi = parseLocalBindList('127.0.0.1:25566, [::1]:25567');
  assert.strictEqual(multi.ok, true);
  assert.strictEqual(multi.binds.length, 2);
  assert.strictEqual(multi.binds[0].host, '127.0.0.1');
  assert.strictEqual(multi.binds[1].host, '::1');

  const duplicated = parseLocalBindList('127.0.0.1:25566,127.0.0.1:25566');
  assert.strictEqual(duplicated.ok, false);
}

function testFormatLocalBind() {
  assert.strictEqual(formatLocalBind({ host: '127.0.0.1', port: 25566 }), '127.0.0.1:25566');
  assert.strictEqual(formatLocalBind({ host: '::1', port: 25566 }), '[::1]:25566');
}

function testValidateConfig() {
  const ok = validateConfig({
    hostname: 'mc-a.example.com, mc-b.example.com',
    localBind: '127.0.0.1:25566',
    logLevel: 'auto',
    logFile: 'C:\\logs\\tunnel.log'
  });
  assert.strictEqual(ok.ok, true);
  assert.deepStrictEqual(ok.hostnames, ['mc-a.example.com', 'mc-b.example.com']);
  assert.strictEqual(ok.binds.length, 1);

  const autoBind = validateConfig({
    hostname: 'mc.example.com',
    localBind: '',
    logLevel: 'auto',
    logFile: '/tmp/tunnel.log'
  });
  assert.strictEqual(autoBind.ok, true);
  assert.strictEqual(autoBind.binds.length, 0);

  const badHost = validateConfig({
    hostname: 'https://mc.example.com',
    localBind: '127.0.0.1:25566',
    logLevel: 'info',
    logFile: '/tmp/tunnel.log'
  });
  assert.strictEqual(badHost.ok, false);

  const badLogLevel = validateConfig({
    hostname: 'mc.example.com',
    localBind: '',
    logLevel: 'verbose',
    logFile: '/tmp/tunnel.log'
  });
  assert.strictEqual(badLogLevel.ok, false);

  const tooManyBinds = validateConfig({
    hostname: 'mc.example.com',
    localBind: '127.0.0.1:25566,127.0.0.1:25567',
    logLevel: 'auto',
    logFile: '/tmp/tunnel.log'
  });
  assert.strictEqual(tooManyBinds.ok, false);
}

function run() {
  testParseHostnames();
  testParseLocalBind();
  testParseLocalBindList();
  testFormatLocalBind();
  testValidateConfig();
  console.log('All tests passed.');
}

run();
