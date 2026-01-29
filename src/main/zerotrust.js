const ACCESS_PATH = '/cdn-cgi/access/';
const ACCESS_URL_REGEX = /https?:\/\/[^\s"'<>]+\/cdn-cgi\/access\/[^\s"'<>]*/gi;

function sanitizeUrl(url) {
  return String(url || '').trim().replace(/[),.;]+$/, '');
}

function extractZeroTrustUrls(text) {
  if (!text) return [];
  const found = [];
  let match;
  const input = String(text);
  ACCESS_URL_REGEX.lastIndex = 0;
  while ((match = ACCESS_URL_REGEX.exec(input)) !== null) {
    const cleaned = sanitizeUrl(match[0]);
    if (cleaned) found.push(cleaned);
  }
  return found;
}

function isZeroTrustUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return parsed.pathname.includes(ACCESS_PATH);
  } catch (_) {
    return false;
  }
}

module.exports = {
  extractZeroTrustUrls,
  isZeroTrustUrl
};
