const { createHash } = require('crypto');
const { getSupabaseConfig, sbFetch } = require('./supabase');

const SECURITY_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self)'
};

function getHeader(event, name) {
  const headers = event.headers || {};
  const key = Object.keys(headers).find(header => header.toLowerCase() === name);
  return key ? String(headers[key] || '') : '';
}

function getAllowedOrigin(event) {
  const origin = getHeader(event, 'origin');
  if (!origin) return '';

  const configuredOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (configuredOrigins.includes(origin)) return origin;

  try {
    const originHost = new URL(origin).host.toLowerCase();
    const requestHost = (
      getHeader(event, 'x-forwarded-host') ||
      getHeader(event, 'host')
    ).split(',')[0].trim().toLowerCase();
    return requestHost && originHost === requestHost ? origin : null;
  } catch {
    return null;
  }
}

function getClientAddress(event) {
  const netlifyAddress = getHeader(event, 'x-nf-client-connection-ip').trim();
  if (netlifyAddress) return netlifyAddress;
  const forwarded = getHeader(event, 'x-forwarded-for').split(',').map(value => value.trim()).filter(Boolean);
  return forwarded.length ? forwarded[forwarded.length - 1] : 'unknown';
}

async function consumeRateLimit(event, name, limit, windowSeconds) {
  const { url, key } = getSupabaseConfig();
  const addressHash = createHash('sha256')
    .update(`${name}:${getClientAddress(event)}`)
    .digest('hex');
  const result = await sbFetch(url, key, 'rpc/consume_public_rate_limit', {
    method: 'POST',
    body: JSON.stringify({
      p_rate_key: addressHash,
      p_limit: limit,
      p_window_seconds: windowSeconds
    })
  });
  return result === true;
}

function responseHeaders(event, extra = {}) {
  const headers = { ...SECURITY_HEADERS };
  const allowedOrigin = getAllowedOrigin(event);
  if (typeof allowedOrigin === 'string' && allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers.Vary = 'Origin';
  }
  return { ...headers, ...extra };
}

function secureHandler(name, options, handler) {
  const config = {
    limit: 120,
    windowSeconds: 60,
    methods: ['POST'],
    maxBodyBytes: 262144,
    ...options
  };

  return async event => {
    const method = String(event.httpMethod || '').toUpperCase();
    const origin = getAllowedOrigin(event);
    if (origin === null) {
      return {
        statusCode: 403,
        headers: responseHeaders(event),
        body: JSON.stringify({ error: 'Origin not allowed', code: 'ORIGIN_NOT_ALLOWED' })
      };
    }

    if (method === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: responseHeaders(event, {
          'Access-Control-Allow-Methods': [...config.methods, 'OPTIONS'].join(', '),
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '600'
        }),
        body: ''
      };
    }

    if (!config.methods.includes(method)) {
      return {
        statusCode: 405,
        headers: responseHeaders(event, { Allow: [...config.methods, 'OPTIONS'].join(', ') }),
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    const bodySize = Buffer.byteLength(event.body || '', event.isBase64Encoded ? 'base64' : 'utf8');
    if (bodySize > config.maxBodyBytes) {
      return {
        statusCode: 413,
        headers: responseHeaders(event),
        body: JSON.stringify({ error: 'Sorğu məlumatı çox böyükdür.', code: 'REQUEST_TOO_LARGE' })
      };
    }

    try {
      if (!(await consumeRateLimit(event, name, config.limit, config.windowSeconds))) {
        return {
          statusCode: 429,
          headers: responseHeaders(event, { 'Retry-After': String(config.windowSeconds) }),
          body: JSON.stringify({ error: 'Sorğular çox tez-tez göndərilir. Bir az sonra yenidən cəhd edin.', code: 'RATE_LIMITED' })
        };
      }
    } catch (error) {
      console.error(`${name} rate limit error:`, error);
      return {
        statusCode: 503,
        headers: responseHeaders(event, { 'Retry-After': '10' }),
        body: JSON.stringify({ error: 'Xidmət müvəqqəti əlçatan deyil.', code: 'RATE_LIMIT_UNAVAILABLE' })
      };
    }

    let response;
    try {
      response = await handler(event);
    } catch (error) {
      console.error(`${name} handler error:`, error);
      response = {
        statusCode: 500,
        body: JSON.stringify({ error: 'Xidmət müvəqqəti əlçatan deyil.', code: 'SERVER_ERROR' })
      };
    }
    if (response.statusCode >= 500) {
      response = {
        ...response,
        body: JSON.stringify({ error: 'Xidmət müvəqqəti əlçatan deyil.', code: 'SERVER_ERROR' })
      };
    }
    return {
      ...response,
      headers: responseHeaders(event, response.headers || {})
    };
  };
}

module.exports = { secureHandler };
