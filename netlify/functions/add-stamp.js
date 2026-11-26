const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { constantTimeEqual, parseJsonObject } = require('../lib/request');
const { getSupabaseConfig, sbFetch } = require('../lib/supabase');
const { secureHandler } = require('../lib/security');

const CUSTOMER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async event => {
  try {
    const body = parseJsonObject(event.body);
    if (!body) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' }) };
    }

    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    const customerId = typeof body.customer_id === 'string'
      ? body.customer_id.trim()
      : typeof body.visitorToken === 'string' ? body.visitorToken.trim() : '';
    const amount = Number(body.amount);
    const billAmount = Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : NaN;

    if (!/^[a-z0-9-]{1,80}$/.test(slug) || !/^\d{4}$/.test(pin) || !CUSTOMER_ID_PATTERN.test(customerId)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' }) };
    }
    if (!Number.isFinite(billAmount) || billAmount <= 0 || billAmount > 99999999.99) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Düzgün hesab məbləği daxil edin.' }) };
    }

    const { url, key } = getSupabaseConfig();
    const restaurants = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,pin_code`
    );
    const restaurant = restaurants?.[0];
    if (!restaurant) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }
    if (!constantTimeEqual(String(restaurant.pin_code || '').trim(), pin)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod yanlışdır.' }) };
    }

    const result = await sbFetch(url, key, 'rpc/apply_customer_stamp_transaction', {
      method: 'POST',
      body: JSON.stringify({
        p_restaurant_id: restaurant.id,
        p_customer_id: customerId,
        p_amount: billAmount,
        p_stamp_delta: 1
      })
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(result) };
  } catch (error) {
    console.error('add-stamp error:', error);
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Server xətası.' }) };
  }
};

exports.handler = secureHandler('add-stamp', { limit: 30 }, exports.handler);
