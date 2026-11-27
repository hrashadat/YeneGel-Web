const { promisify } = require('util');
const { randomBytes, scrypt, timingSafeEqual } = require('crypto');
const { sbFetch } = require('./supabase');

const scryptAsync = promisify(scrypt);
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;

function normalizeAccountName(value) {
  return String(value || '').normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
}

function isValidAccountName(value) {
  const accountName = normalizeAccountName(value);
  const length = Array.from(accountName).length;
  return length >= 3 && length <= 32 && !/\p{C}/u.test(accountName);
}

function isValidAccessCode(value) {
  return typeof value === 'string' && value.length >= 4 && value.length <= 32;
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

async function getCustomerColumns(url, key) {
  const schema = await sbFetch(url, key, '', {
    headers: { Accept: 'application/openapi+json' }
  });
  const definition = schema?.definitions?.customers ||
    schema?.definitions?.['public.customers'] ||
    schema?.components?.schemas?.customers;
  const columns = Object.keys(definition?.properties || {});
  if (!columns.length) {
    throw new Error('Supabase API sxemində customers cədvəlinin sütunları tapılmadı.');
  }
  return new Set(columns);
}

function resolveCustomerSchemaColumns(customerColumns) {
  if (!customerColumns.has('id') || !customerColumns.has('restaurant_id')) {
    throw new Error('customers cədvəlində id və restaurant_id sütunları yoxdur.');
  }
  const accountColumn = customerColumns.has('account_name')
    ? 'account_name'
    : customerColumns.has('username')
      ? 'username'
      : null;
  const credentialColumns = ['access_code', 'password_hash', 'pin_hash']
    .filter(column => customerColumns.has(column));
  if (!accountColumn || !credentialColumns.length) {
    throw new Error('customers cədvəlində hesab adı və giriş kodu sütunları tapılmadı. SQL migration-ı tətbiq edin.');
  }
  return { accountColumn, credentialColumns };
}

module.exports = {
  getCustomerColumns,
  hashAccessCode,
  isValidAccessCode,
  isValidAccountName,
  normalizeAccountName,
  resolveCustomerSchemaColumns,
  verifyAccessCode
};
