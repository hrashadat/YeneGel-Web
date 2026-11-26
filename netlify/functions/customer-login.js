const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { ensureCustomerCard } = require('../lib/customer-cards');
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
    const phone = String(body.phone || '').replace(/[()\s.-]/g, '');
    const legacyToken = String(body.legacy_visitor_token || '').trim();
    if (!/^\+?\d{7,15}$/.test(phone)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Telefon nömrəsini düzgün daxil edin.' }) };
    }

    const { url, key } = getSupabaseConfig();
    const restaurants = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id`
    );
    const restaurant = restaurants?.[0];
    if (!restaurant) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }

    const customers = await sbFetch(
      url,
      key,
      `customers?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&phone=eq.${encodeURIComponent(phone)}&select=id,first_name,last_name,phone`
    );
    const customer = customers?.[0];
    if (!customer) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Bu telefon nömrəsi ilə qeydiyyatdan keçmiş müştəri tapılmadı.' }) };
    }
    await ensureCustomerCard(url, key, restaurant.id, customer.id, legacyToken);

    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
      body: JSON.stringify({
        customer: {
          id: customer.id,
          first_name: customer.first_name,
          last_name: customer.last_name,
          phone: customer.phone
        }
      })
    };
  } catch (err) {
    console.error('customer-login error:', err);
    return { statusCode: 500, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Server xətası: ' + err.message }) };
  }
};
