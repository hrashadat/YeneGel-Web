const JSON_HEADERS = { 'Content-Type': 'application/json' };
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
    const stampDelta = Number(body.stamp_delta);

    if (!/^\d{4}$/.test(pin)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod 4 rəqəm olmalıdır.' }) };
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(customerId)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Müştəri QR kodu etibarsızdır.' }) };
    }
    if (![-1, 1].includes(stampDelta)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Möhür əməliyyatı etibarsızdır.' }) };
    }
    const amount = stampDelta === -1 ? 0 : Number(body.amount);
    const billAmount = Number.isFinite(amount)
      ? Math.round((amount + Number.EPSILON) * 100) / 100
      : NaN;
    if (
      !Number.isFinite(billAmount) ||
      billAmount < 0 ||
      (stampDelta === 1 && billAmount <= 0) ||
      billAmount > 99999999.99
    ) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Düzgün hesab məbləği daxil edin.' }) };
    }

    const { url, key } = getSupabaseConfig();
    const rows = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,pin_code`
    );
    const restaurant = rows?.[0];
    if (!restaurant) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }
    if (String(restaurant.pin_code || '').trim() !== pin) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod yanlışdır.' }) };
    }

    const result = await sbFetch(url, key, 'rpc/apply_customer_stamp_transaction', {
      method: 'POST',
      body: JSON.stringify({
        p_restaurant_id: restaurant.id,
        p_customer_id: customerId,
        p_amount: billAmount,
        p_stamp_delta: stampDelta
      })
    });
    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
      body: JSON.stringify(result)
    };
  } catch (err) {
    const statusCode = /Müştəri tapılmadı|Möhür silmək üçün|Kart tapılmadı/.test(err.message) ? 422 : 500;
    console.error('cashier-stamp error:', err);
    return { statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
