const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { ensureCustomerCard } = require('../lib/customer-cards');
const {
  hashAccessCode,
  isValidAccessCode,
  isValidAccountName,
  normalizeAccountName
} = require('../lib/customer-credentials');
const { encodeQueryValue, isValidRestaurantSlug, parseJsonObject } = require('../lib/request');
const { getSupabaseConfig, getSupabaseErrorMessage, sbFetch } = require('../lib/supabase');
const { secureHandler } = require('../lib/security');

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
    body: JSON.stringify(body)
  };
}

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method Not Allowed' });
  }

  try {
    const body = parseJsonObject(event.body);
    if (!body) {
      return jsonResponse(400, { error: 'Sorğu məlumatı etibarsızdır.' });
    }

    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const accountName = typeof body.account_name === 'string' ? normalizeAccountName(body.account_name) : '';
    const accessCode = typeof body.access_code === 'string' ? body.access_code : '';
    const legacyToken = typeof body.legacy_visitor_token === 'string' ? body.legacy_visitor_token.trim() : '';
    if (!isValidRestaurantSlug(slug) || legacyToken.length > 180) {
      return jsonResponse(400, { error: 'Sorğu məlumatı etibarsızdır.' });
    }
    if (!isValidAccountName(accountName)) {
      return jsonResponse(400, {
        error: 'Hesab adında hərf, rəqəm, boşluq, nöqtə, tire və alt xətt istifadə edin.'
      });
    }
    if (!isValidAccessCode(accessCode)) {
      return jsonResponse(400, { error: 'Kod 4–32 simvoldan ibarət olmalıdır.' });
    }

    const { url, key } = getSupabaseConfig();
    const restaurants = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id`
    );
    const restaurant = restaurants?.[0];
    if (!restaurant) {
      return jsonResponse(404, { error: 'Restoran tapılmadı.' });
    }

    const existing = await sbFetch(
      url,
      key,
      `customers?restaurant_id=eq.${encodeQueryValue(restaurant.id)}&account_name=eq.${encodeQueryValue(accountName)}&select=id`
    );
    if (existing?.length) {
      return jsonResponse(409, { error: 'Bu hesab adı artıq istifadə olunur. Başqa hesab adı seçin.' });
    }

    const accessCodeHash = await hashAccessCode(accessCode);
    let customer;
    try {
      const inserted = await sbFetch(url, key, 'customers', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          account_name: accountName,
          access_code: accessCodeHash,
          first_name: accountName,
          last_name: '',
          phone: null
        })
      });
      customer = inserted?.[0];
    } catch (error) {
      if (error.code === '23505') {
        return jsonResponse(409, { error: 'Bu hesab adı artıq istifadə olunur. Başqa hesab adı seçin.' });
      }
      throw error;
    }

    if (!customer?.id) throw new Error('Müştəri qeydiyyatı tamamlanmadı.');
    await ensureCustomerCard(url, key, restaurant.id, customer.id, legacyToken);

    return jsonResponse(201, {
      customer: {
        id: customer.id,
        account_name: customer.account_name,
        first_name: customer.first_name || customer.account_name,
        last_name: customer.last_name || '',
        phone: customer.phone || null
      }
    });
  } catch (error) {
    console.error('customer-register error:', error);
    return jsonResponse(500, {
      error: getSupabaseErrorMessage(error),
      code: error.code || 'SERVER_ERROR'
    });
  }
};

exports.handler = secureHandler('customer-register', { limit: 20, windowSeconds: 60 }, exports.handler);
