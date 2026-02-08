const fs = require('fs');
const path = require('path');
const https = require('https');

function normalizeVersion(input) {
  const text = String(input || '').trim().replace(/^v/i, '');
  const match = text.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return '';
  return `${Number(match[1])}.${Number(match[2])}.${Number(match[3])}`;
}

function compareVersions(a, b) {
  const av = normalizeVersion(a).split('.').map((item) => Number(item));
  const bv = normalizeVersion(b).split('.').map((item) => Number(item));
  if (av.length !== 3 || bv.length !== 3 || av.some((n) => !Number.isFinite(n)) || bv.some((n) => !Number.isFinite(n))) {
    return 0;
  }
  for (let i = 0; i < 3; i += 1) {
    if (av[i] > bv[i]) return 1;
    if (av[i] < bv[i]) return -1;
  }
  return 0;
}

function fetchJson(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects'));
      return;
    }

    const req = https.get(url, {
      headers: {
        'User-Agent': 'mc-tunnel-ui-updater',
        'Accept': 'application/vnd.github+json'
      }
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(fetchJson(res.headers.location, redirects + 1));
        return;
      }

      if (res.statusCode !== 200) {
        const msg = `HTTP ${res.statusCode} for ${url}`;
        res.resume();
        reject(new Error(msg));
        return;
      }

      let data = '';
      res.on('data', (chunk) => {
        data += chunk.toString();
      });
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

function sanitizeFileName(fileName) {
  return String(fileName || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function isIgnoredAsset(name) {
  const lower = name.toLowerCase();
  return lower.endsWith('.blockmap')
    || lower.endsWith('.yml')
    || lower.endsWith('.yaml')
    || lower.endsWith('.sha256')
    || lower.endsWith('.sha256sum')
    || lower.endsWith('.sig')
    || lower.endsWith('.txt');
}

function scoreWindowsAsset(name) {
  const lower = name.toLowerCase();
  if (isIgnoredAsset(lower)) return -1;
  if (lower.endsWith('.exe')) return lower.includes('setup') ? 120 : 100;
  if (lower.endsWith('.msi')) return 90;
  if (lower.endsWith('.zip')) return 50;
  return -1;
}

function scoreMacAsset(name, arch) {
  const lower = name.toLowerCase();
  if (isIgnoredAsset(lower)) return -1;

  let score = -1;
  if (lower.endsWith('.dmg')) score = 120;
  else if (lower.endsWith('.zip')) score = 80;
  else return -1;

  const isArm = /(arm64|aarch64)/.test(lower);
  const isX64 = /(x64|amd64|x86_64)/.test(lower);
  if (arch === 'arm64') {
    if (isArm) score += 20;
    if (isX64) score -= 25;
  } else if (arch === 'x64') {
    if (isX64) score += 20;
    if (isArm) score -= 30;
  }

  return score;
}

function scoreLinuxAsset(name, arch) {
  const lower = name.toLowerCase();
  if (isIgnoredAsset(lower)) return -1;

  let score = -1;
  if (lower.endsWith('.appimage')) score = 120;
  else if (lower.endsWith('.deb')) score = 100;
  else if (lower.endsWith('.rpm')) score = 90;
  else if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) score = 70;
  else return -1;

  const isArm64 = /(arm64|aarch64)/.test(lower);
  const isArm32 = /(armv7|armhf)/.test(lower);
  const isX64 = /(x64|amd64|x86_64)/.test(lower);
  if (arch === 'arm64') {
    if (isArm64) score += 20;
    if (isX64) score -= 50;
    if (isArm32) score -= 20;
  } else if (arch === 'x64') {
    if (isX64) score += 20;
    if (isArm64 || isArm32) score -= 50;
  }

  return score;
}

function selectBestAsset(assets, platform, arch) {
  if (!Array.isArray(assets) || assets.length === 0) return null;

  const scored = assets
    .filter((asset) => asset && asset.name && asset.browser_download_url)
    .map((asset) => {
      let score = -1;
      if (platform === 'win32') {
        score = scoreWindowsAsset(asset.name);
      } else if (platform === 'darwin') {
        score = scoreMacAsset(asset.name, arch);
      } else if (platform === 'linux') {
        score = scoreLinuxAsset(asset.name, arch);
      }
      return { asset, score };
    })
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? scored[0].asset : null;
}

function downloadToFile(url, destPath, onProgress, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) {
      reject(new Error('Too many redirects'));
      return;
    }

    const req = https.get(url, {
      headers: { 'User-Agent': 'mc-tunnel-ui-updater' }
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        resolve(downloadToFile(res.headers.location, destPath, onProgress, redirects + 1));
        return;
      }

      if (res.statusCode !== 200) {
        const msg = `HTTP ${res.statusCode} for ${url}`;
        res.resume();
        reject(new Error(msg));
        return;
      }

      const total = Number(res.headers['content-length'] || 0);
      let received = 0;
      const out = fs.createWriteStream(destPath);

      res.on('data', (chunk) => {
        received += chunk.length;
        if (onProgress) {
          const percent = total > 0 ? Math.floor((received / total) * 100) : null;
          onProgress({ received, total, percent });
        }
      });

      res.pipe(out);

      out.on('finish', () => {
        out.close(() => resolve(destPath));
      });
      out.on('error', (err) => reject(err));
    });

    req.on('error', (err) => reject(err));
  });
}

function shortReleaseNotes(text) {
  const clean = String(text || '').trim();
  if (!clean) return '';
  const maxLength = 700;
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, maxLength)}...`;
}

async function checkForAppUpdate(options) {
  const owner = String(options.owner || '').trim();
  const repo = String(options.repo || '').trim();
  const currentVersion = String(options.currentVersion || '').trim();
  const platform = String(options.platform || process.platform).trim();
  const arch = String(options.arch || process.arch).trim();
  if (!owner || !repo) {
    return { ok: false, error: 'Update source is not configured' };
  }

  const current = normalizeVersion(currentVersion);
  if (!current) {
    return { ok: false, error: 'Current app version is invalid' };
  }

  try {
    const release = await fetchJson(`https://api.github.com/repos/${owner}/${repo}/releases/latest`);
    const latestVersion = normalizeVersion(release.tag_name || release.name || '');
    if (!latestVersion) {
      return { ok: false, error: 'Latest release version is invalid' };
    }

    if (compareVersions(latestVersion, current) <= 0) {
      return { ok: true, updateAvailable: false, currentVersion: current, latestVersion };
    }

    const asset = selectBestAsset(release.assets || [], platform, arch);
    if (!asset) {
      return {
        ok: false,
        updateAvailable: true,
        currentVersion: current,
        latestVersion,
        error: `No compatible package found for ${platform}/${arch}`
      };
    }

    return {
      ok: true,
      updateAvailable: true,
      currentVersion: current,
      latestVersion,
      tagName: String(release.tag_name || '').trim(),
      releaseName: String(release.name || '').trim(),
      releaseUrl: String(release.html_url || '').trim(),
      publishedAt: String(release.published_at || '').trim(),
      releaseNotes: shortReleaseNotes(release.body || ''),
      asset: {
        name: String(asset.name || '').trim(),
        size: Number(asset.size || 0),
        url: String(asset.browser_download_url || '').trim()
      }
    };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : 'Update check failed' };
  }
}

async function downloadUpdateAsset(asset, downloadDir, onProgress) {
  if (!asset || !asset.url) {
    return { ok: false, error: 'Update asset is invalid' };
  }

  const fileName = sanitizeFileName(asset.name || `mc-tunnel-update-${Date.now().toString(36)}`);
  if (!fileName) {
    return { ok: false, error: 'Update asset filename is invalid' };
  }

  let tempPath = '';
  try {
    fs.mkdirSync(downloadDir, { recursive: true });
    const targetPath = path.join(downloadDir, fileName);
    tempPath = `${targetPath}.download-${Date.now().toString(36)}`;

    await downloadToFile(asset.url, tempPath, onProgress);
    fs.renameSync(tempPath, targetPath);
    tempPath = '';

    const lower = targetPath.toLowerCase();
    if (process.platform !== 'win32' && (lower.endsWith('.appimage') || lower.endsWith('.run'))) {
      fs.chmodSync(targetPath, 0o755);
    }

    return { ok: true, path: targetPath };
  } catch (err) {
    if (tempPath && fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (_) {
        // ignore cleanup errors
      }
    }
    return { ok: false, error: err && err.message ? err.message : 'Update download failed' };
  }
}

module.exports = {
  checkForAppUpdate,
  downloadUpdateAsset,
  normalizeVersion
};
