const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8'
};
const { constantTimeEqual, isBoundedString, isValidRestaurantSlug, parseJsonObject } = require('../lib/request');
const { secureHandler } = require('../lib/security');
const { getSupabaseConfig, sbFetch } = require('../lib/supabase');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: JSON_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Yalnız POST sorğularına icazə verilir.' })
    };
  }

  try {
    const body = parseJsonObject(event.body);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' })
      };
    }
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const accessCodeValue = body.accessCode ?? body.adminCode ?? body.admin_code;
    const accessCode = typeof accessCodeValue === 'string' ? accessCodeValue.trim() : '';
    const cashierPin = typeof body.pin === 'string' ? body.pin.trim() : '';

    if (!isValidRestaurantSlug(slug) || !accessCode || !isBoundedString(accessCode, 256) || !/^\d{4}$/.test(cashierPin)) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Restoran kodu, admin kodu və personel PİN kodu tələb olunur.' })
      };
    }

    const { url, key } = getSupabaseConfig();
    const rows = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,name,pin_code,admin_code,stamp_goal,reward_text,about,address,phone,instagram,menu_json,bonus_mode,bonus_fixed_amount,bonus_percent`
    );

    const restaurant = rows?.[0];
    if (!restaurant) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Restoran tapılmadı.' })
      };
    }

    if (!constantTimeEqual(String(restaurant.admin_code || '').trim(), accessCode)) {
      return {
        statusCode: 401,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Admin giriş kodu yanlışdır.' })
      };
    }
    if (!constantTimeEqual(String(restaurant.pin_code || '').trim(), cashierPin)) {
      return {
        statusCode: 401,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Personel PİN kodu yanlışdır.' })
      };
    }

    const { admin_code, pin_code, ...safeRestaurant } = restaurant;
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: true, restaurant: safeRestaurant })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Server xətası: ' + err.message })
    };
  }
};

exports.handler = secureHandler('admin-login', { limit: 8, windowSeconds: 60 }, exports.handler);
