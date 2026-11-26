const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { constantTimeEqual, isBoundedString, isValidRestaurantSlug, parseJsonObject } = require('../lib/request');
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
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const accessCode = typeof body.accessCode === 'string' ? body.accessCode.trim() : '';
    const cashierPin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!isValidRestaurantSlug(slug) || !accessCode || !isBoundedString(accessCode, 256) || !/^\d{4}$/.test(cashierPin)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran, admin kodu və kassir PİN kodu tələb olunur.' }) };
    }

    const { url, key } = getSupabaseConfig();
    const restaurants = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,admin_code,pin_code`
    );
    const restaurant = restaurants?.[0];
    if (!restaurant) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }
    if (!constantTimeEqual(String(restaurant.admin_code || '').trim(), accessCode)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Admin giriş kodu yanlışdır.' }) };
    }
    if (!constantTimeEqual(String(restaurant.pin_code || '').trim(), cashierPin)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Kassir PİN kodu yanlışdır.' }) };
    }

    const customers = await sbFetch(
      url,
      key,
      `customers?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&select=id,account_name,first_name,last_name,phone,created_at&order=created_at.desc&limit=500`
    );
    const cards = await sbFetch(
      url,
      key,
      `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&select=visitor_token,stamps_count,bonus_balance,bonus_carryover,total_spent`
    );
    const cardsByCustomerId = new Map((cards || []).map(card => [card.visitor_token, card]));
    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        customers: (customers || []).map(customer => ({
          ...customer,
          card: cardsByCustomerId.get(customer.id) || {
            stamps_count: 0,
            bonus_balance: 0,
            bonus_carryover: 0,
            total_spent: 0
          }
        }))
      })
    };

  } catch (err) {
    console.error('admin-customers error:', err);
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Server xətası: ' + err.message }) };
  }
};

exports.handler = secureHandler('admin-customers', { limit: 30 }, exports.handler);
