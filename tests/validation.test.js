const assert = require('assert');
const { parseLocalBind, validateConfig } = require('../src/main/validation');

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

function testValidateConfig() {
  const ok = validateConfig({
    hostname: 'mc.example.com',
    localBind: '127.0.0.1:25566',
    logLevel: 'auto',
    logFile: 'C:\\logs\\tunnel.log'
  });
  assert.strictEqual(ok.ok, true);

  const badHost = validateConfig({
    hostname: 'https://mc.example.com',
    localBind: '127.0.0.1:25566',
    logLevel: 'info',
    logFile: '/tmp/tunnel.log'
  });
  assert.strictEqual(badHost.ok, false);

  const badLogLevel = validateConfig({
    hostname: 'mc.example.com',
    localBind: '127.0.0.1:25566',
    logLevel: 'verbose',
    logFile: '/tmp/tunnel.log'
  });
  assert.strictEqual(badLogLevel.ok, false);
}

function run() {
  testParseLocalBind();
  testValidateConfig();
  console.log('All tests passed.');
}

run();
