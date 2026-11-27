const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { normalizeCard } = require('../lib/loyalty');
const { constantTimeEqual, isValidUuid, parseJsonObject } = require('../lib/request');
const { getSupabaseConfig, sbFetch } = require('../lib/supabase');
const { secureHandler } = require('../lib/security');

const CUSTOMER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
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

    if (!/^[a-z0-9-]{1,80}$/.test(slug) || !/^\d{4}$/.test(pin) || !CUSTOMER_ID_PATTERN.test(customerId)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' }) };
    }

    const { url, key } = getSupabaseConfig();
    const restaurants = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,pin_code,stamp_goal,bonus_mode,bonus_fixed_amount,bonus_percent`
    );
    const restaurant = restaurants?.[0];
    if (!restaurant) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }
    if (!constantTimeEqual(String(restaurant.pin_code || '').trim(), pin)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Personel PİN kodu yanlışdır.' }) };
    }

    const result = await sbFetch(url, key, 'rpc/bank_customer_bonus', {
      method: 'POST',
      body: JSON.stringify({
        p_restaurant_id: restaurant.id,
        p_customer_id: customerId
      })
    });

    const cardPayload = result?.card || result;
    if (!isValidUuid(cardPayload?.id)) {
      return {
        statusCode: 502,
        headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
        body: JSON.stringify({ error: 'Bonus sonraya saxlanıldı, lakin yenilənmiş kart alınmadı.' })
      };
    }

    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        ...result,
        card: normalizeCard(restaurant, cardPayload)
      })
    };
  } catch (error) {
    console.error('bank-bonus error:', error);
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Server xətası.' }) };
  }
};

exports.handler = secureHandler('bank-bonus', { limit: 30 }, exports.handler);
