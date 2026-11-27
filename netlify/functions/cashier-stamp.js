const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { constantTimeEqual, isValidRestaurantSlug, isValidUuid, parseJsonObject } = require('../lib/request');
const { normalizeCard } = require('../lib/loyalty');
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
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    const customerId = typeof body.customer_id === 'string' ? body.customer_id.trim() : '';
    const stampDelta = typeof body.stamp_delta === 'number' || typeof body.stamp_delta === 'string'
      ? Number(body.stamp_delta)
      : NaN;

    if (!isValidRestaurantSlug(slug) || !isValidUuid(customerId)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Müştəri QR kodu etibarsızdır.' }) };
    }
    if (!/^\d{4}$/.test(pin)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod 4 rəqəm olmalıdır.' }) };
    }
    if (![-1, 1].includes(stampDelta)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Möhür əməliyyatı etibarsızdır.' }) };
    }
    const amount = stampDelta === -1
      ? 0
      : (typeof body.amount === 'number' || typeof body.amount === 'string') ? Number(body.amount) : NaN;
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
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,pin_code,stamp_goal,bonus_mode,bonus_fixed_amount,bonus_percent`
    );
    const restaurant = rows?.[0];
    if (!restaurant) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }
    if (!constantTimeEqual(String(restaurant.pin_code || '').trim(), pin)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod yanlışdır.' }) };
    }

    const rpcPayload = {
      p_restaurant_id: restaurant.id,
      p_customer_id: customerId,
      p_amount: billAmount,
      p_stamp_delta: stampDelta
    };
    let result;
    try {
      result = await sbFetch(url, key, 'rpc/apply_customer_stamp_transaction', {
        method: 'POST',
        body: JSON.stringify(rpcPayload)
      });
    } catch (error) {
      console.error('cashier-stamp apply_customer_stamp_transaction RPC failed:', {
        status: error.status || null,
        code: error.code || null,
        message: error.message || 'Naməlum Supabase xətası.',
        details: error.details || null,
        hint: error.hint || null,
        payloadFields: Object.keys(rpcPayload),
        payloadTypes: {
          p_restaurant_id: 'uuid',
          p_customer_id: 'uuid',
          p_amount: 'numeric',
          p_stamp_delta: 'smallint'
        }
      });

      const databaseMessage = String(error.message || 'Naməlum xəta.')
        .replace(/\s+/g, ' ')
        .slice(0, 180);
      const isBusinessError = /Müştəri tapılmadı|Müştəri kartı tapılmadı|Möhür silmək üçün kartda möhür yoxdur|Geri alınacaq əməliyyat tapılmadı|Restoran tapılmadı|Düzgün hesab məbləği daxil edin|Möhür əməliyyatı etibarsızdır/i
        .test(databaseMessage);
      const isRpcSignatureError = ['PGRST202', 'PGRST203', '42883'].includes(error.code);
      const message = isRpcSignatureError
        ? 'Supabase-də apply_customer_stamp_transaction funksiyası və ya parametr imzası tapılmadı. SQL migration-ları yoxlayın.'
        : isBusinessError
          ? databaseMessage
          : `Supabase möhür əməliyyatı xətası${error.code ? ` (${error.code})` : ''}: ${databaseMessage}`;
      return {
        statusCode: isBusinessError ? 422 : 500,
        headers: JSON_HEADERS,
        body: JSON.stringify({
          error: message,
          code: isRpcSignatureError ? 'STAMP_RPC_SIGNATURE_MISMATCH' : error.code || 'STAMP_TRANSACTION_FAILED'
        })
      };
    }

    if (!isValidUuid(result?.card?.id)) {
      console.error('cashier-stamp RPC completed without returning a valid card id:', {
        restaurantId: restaurant.id,
        customerId
      });
      return {
        statusCode: 502,
        headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
        body: JSON.stringify({
          error: 'Möhür əməliyyatı bazada tamamlandı, amma yenilənmiş kartın ID-si alınmadı. Müştərini yenidən skan edin.',
          code: 'CARD_REFRESH_FAILED'
        })
      };
    }

    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
      body: JSON.stringify({ ...result, card: normalizeCard(restaurant, result.card) })
    };

  } catch (err) {
    const isBusinessError = /Müştəri tapılmadı|Müştəri kartı tapılmadı|Möhür silmək üçün|Geri alınacaq əməliyyat tapılmadı|Restoran tapılmadı/i.test(err.message || '');
    const errorMessage = String(err.message || 'Naməlum xəta.')
      .replace(/\s+/g, ' ')
      .slice(0, 180);
    console.error('cashier-stamp error:', {
      message: errorMessage,
      code: err.code || null,
      status: err.status || null,
      details: err.details || null,
      hint: err.hint || null
    });
    return {
      statusCode: isBusinessError ? 422 : 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        error: isBusinessError
          ? errorMessage
          : `Supabase kassir xidməti xətası${err.code ? ` (${err.code})` : ''}: ${errorMessage}`
      })
    };
  }
};

exports.handler = secureHandler('cashier-stamp', {
  limit: 30,
  preserveServerErrorResponse: true
}, exports.handler);
