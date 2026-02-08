const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawn } = require('child_process');

function logLine(onLog, line) {
  if (onLog) onLog(line);
}

function runVersionCheck(exePath) {
  return new Promise((resolve) => {
    const proc = spawn(exePath, ['--version'], { windowsHide: true });
    let output = '';

    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    proc.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    proc.on('error', (err) => {
      resolve({ ok: false, error: err.message, output: output.trim() });
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ ok: true, output: output.trim() });
      } else {
        resolve({ ok: false, error: `Exit code ${code}`, output: output.trim() });
      }
    });
  });
}

function managedBinaryName() {
  return process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
}

function buildSideBySideName() {
  const filename = managedBinaryName();
  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return `${base}-${suffix}${ext}`;
}

function isBusyFileError(err) {
  if (!err || !err.code) return false;
  return err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'ETXTBSY';
}

function listManagedBinaries(installDir) {
  if (!installDir || !fs.existsSync(installDir)) return [];
  const filename = managedBinaryName();
  const ext = path.extname(filename);
  const base = ext ? filename.slice(0, -ext.length) : filename;

  const entries = fs.readdirSync(installDir, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isFile()) return false;
      if (entry.name === filename) return true;
      if (!entry.name.startsWith(`${base}-`)) return false;
      if (ext && !entry.name.endsWith(ext)) return false;
      return true;
    })
    .map((entry) => {
      const fullPath = path.join(installDir, entry.name);
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(fullPath).mtimeMs;
      } catch (_) {
        mtimeMs = 0;
      }
      return { fullPath, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map((item) => item.fullPath);

  return entries;
}

async function probeManagedBinary(installDir) {
  const candidates = listManagedBinaries(installDir);
  if (candidates.length === 0) {
    return { ok: false, reason: 'not_found' };
  }

  let lastOutput = '';
  for (const candidate of candidates) {
    const result = await runVersionCheck(candidate);
    if (result.ok) {
      return { ok: true, path: candidate, version: result.output, managed: true };
    }
    if (result.output) {
      lastOutput = result.output;
    }
  }

  return {
    ok: false,
    reason: 'invalid',
    error: 'Managed cloudflared binary failed to run',
    output: lastOutput
  };
}

function moveBinaryIntoInstallDir(sourcePath, installDir, onLog) {
  const targetPath = path.join(installDir, managedBinaryName());

  try {
    if (process.platform === 'win32' && fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    fs.renameSync(sourcePath, targetPath);
    return targetPath;
  } catch (err) {
    if (!isBusyFileError(err)) {
      throw err;
    }
    const fallbackPath = path.join(installDir, buildSideBySideName());
    fs.renameSync(sourcePath, fallbackPath);
    logLine(onLog, `cloudflared binary is busy; installed side-by-side at ${fallbackPath}`);
    return fallbackPath;
  }
}

function safeRemoveFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {
    // ignore cleanup errors
  }
}

function safeRemoveDir(dirPath) {
  if (!dirPath) return;
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (_) {
    // ignore cleanup errors
  }
}

async function probeCloudflared(preferredPath, options = {}) {
  const installDir = options && options.installDir ? String(options.installDir).trim() : '';

  if (preferredPath && preferredPath.trim()) {
    if (!fs.existsSync(preferredPath)) {
      return { ok: false, error: 'Configured cloudflared path not found' };
    }
    const result = await runVersionCheck(preferredPath);
    if (result.ok) {
      return { ok: true, path: preferredPath, version: result.output };
    }
    return { ok: false, error: result.error || 'cloudflared failed to run', output: result.output };
  }

  const result = await runVersionCheck('cloudflared');
  if (result.ok) {
    return { ok: true, path: 'cloudflared', version: result.output };
  }

  let managedProbe = { ok: false, reason: 'not_found' };
  if (installDir) {
    managedProbe = await probeManagedBinary(installDir);
    if (managedProbe.ok) {
      return managedProbe;
    }
  }

  if (managedProbe.reason === 'invalid') {
    return { ok: false, error: managedProbe.error || 'Managed cloudflared binary failed to run', output: managedProbe.output || result.output };
  }

  return { ok: false, error: result.error || 'cloudflared not found in PATH', output: result.output };
}

function fetchJson(url, onLog) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'mc-tunnel-ui',
        'Accept': 'application/vnd.github+json'
      }
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchJson(res.headers.location, onLog));
      }

      if (res.statusCode !== 200) {
        const msg = `HTTP ${res.statusCode} for ${url}`;
        res.resume();
        return reject(new Error(msg));
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', (err) => reject(err));
  });
}

function downloadToFile(url, destPath, onLog) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'mc-tunnel-ui' }
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadToFile(res.headers.location, destPath, onLog));
      }

      if (res.statusCode !== 200) {
        const msg = `HTTP ${res.statusCode} for ${url}`;
        res.resume();
        return reject(new Error(msg));
      }

      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const out = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0) {
          const percent = Math.floor((received / total) * 100);
          logLine(onLog, `Downloading... ${percent}%`);
        }
      });

      res.pipe(out);

      out.on('finish', () => out.close(() => resolve(destPath)));
      out.on('error', (err) => reject(err));
    });

    req.on('error', (err) => reject(err));
  });
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function parseChecksumText(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const parts = lines[0].split(/\s+/);
  return parts[0] || null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSingleHash(text) {
  const matches = text.match(/[a-fA-F0-9]{64}/g) || [];
  if (matches.length === 1) return matches[0];
  return null;
}

function extractChecksumForAsset(text, assetName) {
  if (!text || !assetName) return null;
  const name = escapeRegExp(assetName);
  const patterns = [
    new RegExp(`${name}\\s*[:=]\\s*([a-fA-F0-9]{64})`, 'i'),
    new RegExp(`([a-fA-F0-9]{64})\\s+\\*?${name}\\b`, 'i'),
    new RegExp(`SHA256\\s*\\(\\s*${name}\\s*\\)\\s*=\\s*([a-fA-F0-9]{64})`, 'i')
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }

  return extractSingleHash(text);
}

function extractDigestHash(asset) {
  if (!asset || !asset.digest) return null;
  const match = String(asset.digest).match(/^sha256:([a-fA-F0-9]{64})$/);
  return match ? match[1] : null;
}

function selectAsset(assets) {
  const platform = process.platform;
  const arch = process.arch;

  const osToken = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'darwin' : 'linux';
  const archToken = arch === 'x64' ? 'amd64' : arch === 'arm64' ? 'arm64' : arch === 'ia32' ? '386' : arch === 'arm' ? 'arm' : arch;

  const ignored = ['.deb', '.rpm', '.pkg', '.sig', '.sha256', '.sha256sum'];

  function scoreAsset(name) {
    const lower = name.toLowerCase();
    if (!lower.includes(osToken) || !lower.includes(archToken)) return -1;
    if (ignored.some((ext) => lower.endsWith(ext))) return -1;

    let score = 10;
    if (platform === 'win32' && lower.endsWith('.exe')) score += 5;
    if (platform === 'darwin' && lower.endsWith('.tgz')) score += 5;
    if (platform === 'linux' && !lower.includes('.')) score += 5;
    return score;
  }

  const scored = assets
    .map((asset) => ({ asset, score: scoreAsset(asset.name) }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0].asset : null;
}

function findChecksumAsset(assets, assetName) {
  const lower = assetName.toLowerCase();
  const exact = assets.find((a) => a.name.toLowerCase() === `${lower}.sha256` || a.name.toLowerCase() === `${lower}.sha256sum`);
  if (exact) return exact;
  return assets.find((a) => a.name.toLowerCase().includes('sha256') && a.name.toLowerCase().includes(lower));
}

function extractTgz(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    const proc = spawn('tar', ['-xzf', archivePath, '-C', destDir], { windowsHide: true });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar exited with code ${code}`));
    });
  });
}

function findBinary(destDir) {
  const expected = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  const direct = path.join(destDir, expected);
  if (fs.existsSync(direct)) return direct;

  const entries = fs.readdirSync(destDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name === expected) {
      return path.join(destDir, entry.name);
    }
  }

  return null;
}

async function installCloudflared(installDir, options = {}) {
  const onLog = options.onLog;
  const requireChecksum = options.requireChecksum !== false;
  let tmpPath = '';
  let extractDir = '';

  try {
    fs.mkdirSync(installDir, { recursive: true });
    logLine(onLog, 'Fetching latest release info...');

    const release = await fetchJson('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', onLog);
    const assets = release.assets || [];

    const asset = selectAsset(assets);
    if (!asset) {
      return { ok: false, error: 'No compatible asset found for this OS/arch' };
    }

    logLine(onLog, `Selected asset: ${asset.name}`);

    tmpPath = path.join(installDir, `${asset.name}.download-${Date.now().toString(36)}`);
    await downloadToFile(asset.browser_download_url, tmpPath, onLog);

    let expectedHash = extractDigestHash(asset);
    if (expectedHash) {
      logLine(onLog, 'Verifying checksum (asset digest)...');
    }

    if (!expectedHash) {
      const checksumAsset = findChecksumAsset(assets, asset.name);
      if (checksumAsset) {
        logLine(onLog, 'Verifying checksum (checksum asset)...');
        const checksumTextPath = path.join(installDir, `${checksumAsset.name}.download-${Date.now().toString(36)}`);
        await downloadToFile(checksumAsset.browser_download_url, checksumTextPath, onLog);
        const checksumText = fs.readFileSync(checksumTextPath, 'utf8');
        expectedHash = extractChecksumForAsset(checksumText, asset.name) || parseChecksumText(checksumText);
        safeRemoveFile(checksumTextPath);
      }
    }

    if (!expectedHash && release.body) {
      expectedHash = extractChecksumForAsset(release.body, asset.name);
      if (expectedHash) {
        logLine(onLog, 'Verifying checksum (release body)...');
      }
    }

    if (expectedHash) {
      const actualHash = await sha256File(tmpPath);
      if (expectedHash.toLowerCase() !== actualHash.toLowerCase()) {
        return { ok: false, error: 'Checksum verification failed' };
      }
    } else {
      if (requireChecksum) {
        return { ok: false, error: 'Checksum not available for this asset' };
      }
      logLine(onLog, 'Checksum not available for this asset; skipping verification.');
    }

    let binaryPath;

    if (asset.name.toLowerCase().endsWith('.tgz')) {
      logLine(onLog, 'Extracting archive...');
      extractDir = path.join(installDir, `.extract-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
      fs.mkdirSync(extractDir, { recursive: true });
      await extractTgz(tmpPath, extractDir);
      const extractedBinary = findBinary(extractDir);
      if (!extractedBinary) {
        return { ok: false, error: 'cloudflared binary not found in extracted archive' };
      }
      binaryPath = moveBinaryIntoInstallDir(extractedBinary, installDir, onLog);
      safeRemoveDir(extractDir);
      extractDir = '';
      safeRemoveFile(tmpPath);
      tmpPath = '';
    } else {
      binaryPath = moveBinaryIntoInstallDir(tmpPath, installDir, onLog);
      tmpPath = '';
    }

    if (!binaryPath || !fs.existsSync(binaryPath)) {
      return { ok: false, error: 'cloudflared binary not found after install' };
    }

    if (process.platform !== 'win32') {
      fs.chmodSync(binaryPath, 0o755);
    }

    logLine(onLog, `Installed to ${binaryPath}`);
    return { ok: true, path: binaryPath };
  } catch (err) {
    safeRemoveFile(tmpPath);
    safeRemoveDir(extractDir);
    return { ok: false, error: err.message };
  }
}

module.exports = {
  probeCloudflared,
  installCloudflared
};
