const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { normalizeCard } = require('../lib/loyalty');
const { constantTimeEqual, parseJsonObject } = require('../lib/request');
const { getSupabaseConfig, getSupabaseErrorMessage, sbFetch } = require('../lib/supabase');
const { secureHandler } = require('../lib/security');

const CUSTOMER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

exports.handler = async event => {
  try {
    const body = parseJsonObject(event.body);
    if (!body) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' }) };
    }

    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    const customerId = typeof body.customer_id === 'string'
      ? body.customer_id.trim()
      : typeof body.visitorToken === 'string' ? body.visitorToken.trim() : '';
    const amountInput = body.amount;
    const amount = typeof amountInput === 'number' || typeof amountInput === 'string'
      ? Number(String(amountInput).trim().replace(',', '.'))
      : NaN;
    const redeemAmount = Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : NaN;

    if (!/^[a-z0-9-]{1,80}$/.test(slug) || !/^\d{4}$/.test(pin) || !CUSTOMER_ID_PATTERN.test(customerId)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' }) };
    }
    if (
      amountInput === '' ||
      amountInput === null ||
      amountInput === undefined ||
      !Number.isFinite(redeemAmount) ||
      redeemAmount < 0 ||
      redeemAmount > 99999999.99 ||
      Math.abs(amount - redeemAmount) > 0.00000001
    ) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'İstifadə ediləcək bonus məbləğini düzgün daxil edin.' }) };
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
    if (!constantTimeEqual(String(restaurant.pin_code || '').trim(), pin)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod yanlışdır.' }) };
    }

    const result = await sbFetch(url, key, 'rpc/redeem_customer_bonus', {
      method: 'POST',
      body: JSON.stringify({
        p_restaurant_id: restaurant.id,
        p_customer_id: customerId,
        p_amount: redeemAmount
      })
    });

    const normalizedResult = result && typeof result === 'object' && result.card
      ? { ...result, card: normalizeCard(restaurant, result.card) }
      : result;

    return {
      statusCode: 200,
      headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
      body: JSON.stringify(normalizedResult)
    };
  } catch (error) {
    console.error('redeem-bonus error:', error);
    const isRpcSignatureError = ['PGRST202', 'PGRST203', '42883'].includes(error.code);
    const clientError = /İstifadə ediləcək bonus məbləğini düzgün daxil edin|İstifadə ediləcək bonus məbləği düzgün deyil|Aktiv bonus yoxdur|İstifadə ediləcək məbləğ bonus balansından çox ola bilməz|Müştəri kartı tapılmadı|Restoran tapılmadı/i
      .test(error.message || '');
    return {
      statusCode: clientError ? 422 : 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        error: isRpcSignatureError
          ? 'Supabase-də redeem_customer_bonus funksiyası və ya parametr imzası tapılmadı. SQL migration-ı tətbiq edin.'
          : clientError
            ? error.message
            : getSupabaseErrorMessage(error),
        code: isRpcSignatureError ? 'REDEEM_RPC_SIGNATURE_MISMATCH' : error.code || 'BONUS_REDEEM_FAILED'
      })
    };
  }
};

exports.handler = secureHandler('redeem-bonus', {
  limit: 20,
  preserveServerErrorResponse: true
}, exports.handler);
