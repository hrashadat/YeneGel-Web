const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { ensureCustomerCard } = require('../lib/customer-cards');
const {
  isValidAccessCode,
  isValidAccountName,
  normalizeAccountName,
  verifyAccessCode
} = require('../lib/customer-credentials');
const { normalizeCard } = require('../lib/loyalty');
const { parseJsonObject } = require('../lib/request');
const { getSupabaseConfig, getSupabaseErrorMessage, sbFetch } = require('../lib/supabase');

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

    const slug = String(body.slug || 'kaya').trim().toLowerCase();
    const accountName = normalizeAccountName(body.account_name);
    const accessCode = typeof body.access_code === 'string' ? body.access_code : '';
    const legacyToken = String(body.legacy_visitor_token || '').trim();
    if (!isValidAccountName(accountName) || !isValidAccessCode(accessCode)) {
      return jsonResponse(400, { error: 'Hesab adını və 4–6 simvolluq kodu düzgün daxil edin.' });
    }

    const { url, key } = getSupabaseConfig();
    const restaurants = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,stamp_goal,bonus_mode,bonus_fixed_amount,bonus_percent`
    );
    const restaurant = restaurants?.[0];
    if (!restaurant) {
      return jsonResponse(404, { error: 'Restoran tapılmadı.' });
    }

    const customers = await sbFetch(
      url,
      key,
      `customers?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&account_name=eq.${encodeURIComponent(accountName)}&select=id,account_name,access_code,first_name,last_name,phone`
    );
    const customer = customers?.[0];
    if (!customer || !(await verifyAccessCode(accessCode, customer.access_code))) {
      return jsonResponse(401, { error: 'Hesab adı və ya kod yanlışdır.' });
    }

    await ensureCustomerCard(url, key, restaurant.id, customer.id, legacyToken);
    const cards = await sbFetch(
      url,
      key,
      `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&visitor_token=eq.${encodeURIComponent(customer.id)}&select=id,stamps_count,reward_unlocked,last_stamped_at,total_spent,bonus_balance`
    );
    const card = cards?.[0];
    if (!card) throw new Error('Müştəri kartı hazırlana bilmədi.');

    return jsonResponse(200, {
      customer: {
        id: customer.id,
        account_name: customer.account_name,
        first_name: customer.first_name || customer.account_name,
        last_name: customer.last_name || '',
        phone: customer.phone || null
      },
      card: normalizeCard(restaurant, card)
    });
  } catch (error) {
    console.error('customer-login error:', error);
    return jsonResponse(500, {
      error: getSupabaseErrorMessage(error),
      code: error.code || 'SERVER_ERROR'
    });
  }
};
