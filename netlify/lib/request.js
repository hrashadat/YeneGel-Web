function parseJsonObject(rawBody) {
  try {
    const body = JSON.parse(rawBody || '{}');
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

module.exports = { parseJsonObject };
