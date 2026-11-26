const { promisify } = require('util');
const { randomBytes, scrypt, timingSafeEqual } = require('crypto');

const scryptAsync = promisify(scrypt);
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function normalizeAccountName(value) {
  return String(value || '').normalize('NFKC').trim().toLowerCase();
}

function isValidAccountName(value) {
  const accountName = normalizeAccountName(value);
  const length = Array.from(accountName).length;
  return length >= 3 && length <= 32 && /^[\p{L}\p{N}_.-]+$/u.test(accountName);
}

function isValidAccessCode(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{4,6}$/.test(value);
}

async function hashAccessCode(accessCode) {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(accessCode, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyAccessCode(accessCode, storedHash) {
  const match = /^scrypt\$16384\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(String(storedHash || ''));
  if (!match) return false;

  const salt = Buffer.from(match[1], 'hex');
  const expectedHash = Buffer.from(match[2], 'hex');
  const actualHash = await scryptAsync(accessCode, salt, expectedHash.length, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024
  });
  return timingSafeEqual(actualHash, expectedHash);
}

module.exports = {
  hashAccessCode,
  isValidAccessCode,
  isValidAccountName,
  normalizeAccountName,
  verifyAccessCode
};
