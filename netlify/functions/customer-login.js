const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { ensureCustomerCard } = require('../lib/customer-cards');
const {
  getCustomerColumns,
  isValidAccessCode,
  isValidAccountName,
  normalizeAccountName,
  resolveCustomerSchemaColumns,
  verifyAccessCode
} = require('../lib/customer-credentials');
const { normalizeCard } = require('../lib/loyalty');
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
    const rawPhone = typeof body.phone === 'string' ? body.phone : '';
    const phoneDigits = rawPhone.replace(/\D/g, '');
    const phoneLocal = phoneDigits.startsWith('994') ? phoneDigits.slice(3) : phoneDigits.startsWith('0') ? phoneDigits.slice(1) : phoneDigits;
    if (rawPhone && !/^\d{9}$/.test(phoneLocal)) return jsonResponse(400, { error: 'Telefon nömrəsi +994 formatında 9 rəqəm olmalıdır.' });
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
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,stamp_goal,bonus_mode,bonus_fixed_amount,bonus_percent`
    );
    const restaurant = restaurants?.[0];
    if (!restaurant) {
      return jsonResponse(404, { error: 'Restoran tapılmadı.' });
    }

    const customerColumns = await getCustomerColumns(url, key);
    const { accountColumn, credentialColumns } = resolveCustomerSchemaColumns(customerColumns);
    const selectColumns = [
      'id',
      accountColumn,
      ...credentialColumns,
      ...['first_name', 'last_name', 'phone'].filter(column => customerColumns.has(column))
    ];

    const customers = await sbFetch(
      url,
      key,
      `customers?restaurant_id=eq.${encodeQueryValue(restaurant.id)}&${accountColumn}=eq.${encodeQueryValue(accountName)}&select=${selectColumns.join(',')}`
    );
    const customer = customers?.[0];
    let codeMatches = false;
    if (customer) {
      for (const column of credentialColumns) {
        if (customer[column] && await verifyAccessCode(accessCode, customer[column])) {
          codeMatches = true;
          break;
        }
      }
    }
    if (!customer || !codeMatches) {
      return jsonResponse(401, { error: 'Hesab adı və ya kod yanlışdır.' });
    }
    if (phoneLocal && customerColumns.has('phone')) {
      const normalizedPhone = `+994${phoneLocal}`;
      await sbFetch(url, key, `customers?id=eq.${encodeURIComponent(customer.id)}`, {
        method: 'PATCH', body: JSON.stringify({ phone: normalizedPhone })
      });
      customer.phone = normalizedPhone;
    }

    await ensureCustomerCard(url, key, restaurant.id, customer.id, legacyToken);
    const cards = await sbFetch(
      url,
      key,
      `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&visitor_token=eq.${encodeURIComponent(customer.id)}&select=id,stamps_count,reward_unlocked,last_stamped_at,total_spent,bonus_balance,bonus_carryover`
    );
    const card = cards?.[0];
    if (!card) throw new Error('Müştəri kartı hazırlana bilmədi.');

    const resolvedAccountName = customer[accountColumn] || customer.account_name || customer.username || accountName;
    return jsonResponse(200, {
      customer: {
        id: customer.id,
        account_name: resolvedAccountName,
        first_name: customer.first_name || resolvedAccountName,
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

exports.handler = secureHandler('customer-login', {
  limit: 30,
  windowSeconds: 60,
  preserveServerErrorResponse: true
}, exports.handler);
