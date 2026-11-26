const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { constantTimeEqual, isValidRestaurantSlug, parseJsonObject } = require('../lib/request');
const { getSupabaseConfig, sbFetch } = require('../lib/supabase');
const { secureHandler } = require('../lib/security');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  try {
    const body = parseJsonObject(event.body);
    if (!body) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' }) };
    }
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : 'kaya';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!isValidRestaurantSlug(slug)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' }) };
    }
    if (!/^\d{4}$/.test(pin)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod 4 rəqəm olmalıdır.' }) };
    }

    const { url, key } = getSupabaseConfig();
    const rows = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,name,pin_code,stamp_goal,reward_text,about,address,phone,instagram,menu_json,bonus_mode,bonus_fixed_amount,bonus_percent`
    );
    const restaurant = rows?.[0];
    if (!restaurant) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }
    if (!constantTimeEqual(String(restaurant.pin_code || '').trim(), pin)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod yanlışdır.' }) };
    }
    const { pin_code, ...safeRestaurant } = restaurant;
    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
      body: JSON.stringify({ restaurant: safeRestaurant })
    };

  } catch (err) {
    console.error('cashier-login error:', err);
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Server xətası: ' + err.message }) };
  }
};

exports.handler = secureHandler('cashier-login', { limit: 12, windowSeconds: 60 }, exports.handler);
