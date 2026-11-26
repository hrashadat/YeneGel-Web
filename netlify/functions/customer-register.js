const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { ensureCustomerCard } = require('../lib/customer-cards');
const { parseJsonObject } = require('../lib/request');
const { getSupabaseConfig, getSupabaseErrorMessage, sbFetch } = require('../lib/supabase');

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
    const firstName = String(body.first_name || '').trim();
    const lastName = String(body.last_name || '').trim();
    const phone = String(body.phone || '').replace(/[()\s.-]/g, '');
    const legacyToken = String(body.legacy_visitor_token || '').trim();

    if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Ad və soyadı düzgün daxil edin.' }) };
    }
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

    const existing = await sbFetch(
      url,
      key,
      `customers?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&phone=eq.${encodeURIComponent(phone)}&select=id,first_name,last_name,phone`
    );
    let customer = existing?.[0];
    if (!customer) {
      try {
        const inserted = await sbFetch(url, key, 'customers', {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            first_name: firstName,
            last_name: lastName,
            phone
          })
        });
        customer = inserted?.[0];
      } catch (err) {
        if (err.code !== '23505') throw err;
        const duplicates = await sbFetch(
          url,
          key,
          `customers?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&phone=eq.${encodeURIComponent(phone)}&select=id,first_name,last_name,phone`
        );
        customer = duplicates?.[0];
      }
    }
    if (!customer?.id) throw new Error('Müştəri qeydiyyatı tamamlanmadı.');
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
    console.error('customer-register error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: getSupabaseErrorMessage(err), code: err.code || 'SERVER_ERROR' })
    };
  }
};
