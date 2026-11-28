const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8'
};
const { constantTimeEqual, isBoundedString, isValidRestaurantSlug, parseJsonObject } = require('../lib/request');
const { secureHandler } = require('../lib/security');
const { getSupabaseConfig, getSupabaseErrorMessage, sbFetch } = require('../lib/supabase');

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

    if (!isValidRestaurantSlug(slug) || !accessCode || !isBoundedString(accessCode, 256)) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Restoran kodu, admin kodu və personel PİN kodu tələb olunur.' })
      };
    }

    const { url, key } = getSupabaseConfig();
    let rows;
    let campaignDefaultsAvailable = true;
    try {
      rows = await sbFetch(
        url,
        key,
        `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,name,pin_code,admin_code,stamp_goal,reward_text,about,address,phone,instagram,menu_json,bonus_mode,bonus_fixed_amount,bonus_percent,campaign_default_hours,campaign_default_message`
      );
    } catch (error) {
      if (error.code !== '42703' && error.code !== 'PGRST204') throw error;
      campaignDefaultsAvailable = false;
      rows = await sbFetch(
        url,
        key,
        `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,name,pin_code,admin_code,stamp_goal,reward_text,about,address,phone,instagram,menu_json,bonus_mode,bonus_fixed_amount,bonus_percent`
      );
    }

    const restaurant = rows?.[0];
    if (!restaurant) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Restoran tapılmadı.' })
      };
    }

    if (!String(restaurant.admin_code || '').trim()) {
      return {
        statusCode: 403,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Bu restoran üçün admin giriş kodu təyin edilməyib.', code: 'ADMIN_CODE_NOT_CONFIGURED' })
      };
    }

    if (!constantTimeEqual(String(restaurant.admin_code || '').trim(), accessCode)) {
      return {
        statusCode: 401,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Admin giriş kodu yanlışdır.' })
      };
    }

    const { admin_code, pin_code, ...safeRestaurant } = restaurant;
    if (!campaignDefaultsAvailable) {
      safeRestaurant.campaign_default_hours = 1;
      safeRestaurant.campaign_default_message = 'Sizə xüsusi fürsət!';
    }
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ ok: true, restaurant: safeRestaurant, warning: campaignDefaultsAvailable ? null : 'Kampaniya standartları üçün 20261128200000_customer_phones_campaigns.sql migration-ını Supabase-də tətbiq edin.' })
    };
  } catch (err) {
    console.error('admin-login error:', err);
    return {
      statusCode: ['42703', '42P01', 'PGRST204'].includes(err.code) ? 503 : 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: getSupabaseErrorMessage(err), code: err.code || 'SERVER_ERROR' })
    };
  }
};

exports.handler = secureHandler('admin-login', {
  limit: 8,
  windowSeconds: 60,
  preserveServerErrorResponse: true
}, exports.handler);
