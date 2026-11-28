const { timingSafeEqual } = require('crypto');

function parseJsonObject(rawBody) {
  try {
    const body = JSON.parse(rawBody || '{}');
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function isValidRestaurantSlug(value) {
  return typeof value === 'string' && /^[a-z0-9-]{1,80}$/.test(value);
}

function isValidUuid(value) {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isBoundedString(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength;
}

function encodeQueryValue(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, character =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function constantTimeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left == null ? '' : left), 'utf8');
  const rightBuffer = Buffer.from(String(right == null ? '' : right), 'utf8');
  const size = Math.max(leftBuffer.length, rightBuffer.length, 1);
  if (size > 4096) return false;
  const paddedLeft = Buffer.alloc(size);
  const paddedRight = Buffer.alloc(size);
  leftBuffer.copy(paddedLeft);
  rightBuffer.copy(paddedRight);
  const equal = timingSafeEqual(paddedLeft, paddedRight);
  return equal && leftBuffer.length === rightBuffer.length;
}

module.exports = {
  constantTimeEqual,
  encodeQueryValue,
  isBoundedString,
  isValidRestaurantSlug,
  isValidUuid,
  parseJsonObject
};
