const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { normalizeCard } = require('../lib/loyalty');
const { parseJsonObject } = require('../lib/request');
const { getSupabaseConfig, sbFetch } = require('../lib/supabase');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }
  try {
    const body = parseJsonObject(event.body);
    if (!body) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' }) };
    }
    const slug = String(body.slug || 'kaya').trim().toLowerCase();
    const pin = String(body.pin || '').trim();
    const customerId = String(body.customer_id || '').trim();
    if (!/^\d{4}$/.test(pin)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod 4 rəqəm olmalıdır.' }) };
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'QR kod etibarsızdır.' }) };
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
    if (String(restaurant.pin_code || '').trim() !== pin) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod yanlışdır.' }) };
    }
    const customers = await sbFetch(
      url,
      key,
      `customers?id=eq.${encodeURIComponent(customerId)}&restaurant_id=eq.${encodeURIComponent(restaurant.id)}&select=id,first_name,last_name,phone`
    );
    const customer = customers?.[0];
    if (!customer) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Müştəri tapılmadı.' }) };
    }
    const cards = await sbFetch(
      url,
      key,
      `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&visitor_token=eq.${encodeURIComponent(customer.id)}&select=id,stamps_count,reward_unlocked,total_spent,bonus_balance`
    );
    const card = cards?.[0];
    if (!card) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Müştəri kartı tapılmadı.' }) };
    }
    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
      body: JSON.stringify({ customer, card: normalizeCard(restaurant, card) })
    };
  } catch (err) {
    console.error('cashier-customer error:', err);
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Server xətası: ' + err.message }) };
  }
};
