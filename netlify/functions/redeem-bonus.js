const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { normalizeCard } = require('../lib/loyalty');
const { constantTimeEqual, parseJsonObject } = require('../lib/request');
const { getSupabaseConfig, sbFetch } = require('../lib/supabase');
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
      ? Number(amountInput)
      : NaN;
    const redeemAmount = Number.isFinite(amount) ? Math.round((amount + Number.EPSILON) * 100) / 100 : NaN;

    if (!/^[a-z0-9-]{1,80}$/.test(slug) || !/^\d{4}$/.test(pin) || !CUSTOMER_ID_PATTERN.test(customerId)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' }) };
    }
    if (!Number.isFinite(redeemAmount) || redeemAmount < 0 || redeemAmount > 99999999.99 ||
      Math.abs(amount - redeemAmount) > 0.00000001) {
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

    if (redeemAmount === 0) {
      const cards = await sbFetch(
        url,
        key,
        `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&visitor_token=eq.${encodeURIComponent(customerId)}&select=id,stamps_count,reward_unlocked,total_spent,bonus_balance,bonus_carryover`
      );
      const card = cards?.[0];
      if (!card) {
        return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Müştəri kartı tapılmadı.' }) };
      }

      const oldCarryover = Number(card.bonus_carryover || 0);
      const totalBalance = Number(card.bonus_balance || 0);
      const currentCycleBonus = Math.max(0, Number((totalBalance - oldCarryover).toFixed(2)));
      const newCarryover = Number((oldCarryover + currentCycleBonus).toFixed(2));

      const updatedCards = await sbFetch(
        url,
        key,
        `loyalty_cards?id=eq.${encodeURIComponent(card.id)}&select=id,stamps_count,reward_unlocked,total_spent,bonus_balance,bonus_carryover`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            stamps_count: 0,
            total_spent: 0,
            reward_unlocked: false,
            bonus_carryover: newCarryover,
            bonus_balance: newCarryover
          })
        }
      );

      const updatedCard = updatedCards?.[0] || {
        ...card,
        stamps_count: 0,
        total_spent: 0,
        reward_unlocked: false,
        bonus_carryover: newCarryover,
        bonus_balance: newCarryover
      };

      return {
        statusCode: 200,
        headers: { ...JSON_HEADERS, 'Cache-Control': 'no-store' },
        body: JSON.stringify({ card: normalizeCard(restaurant, updatedCard) })
      };
    }

    const result = await sbFetch(url, key, 'rpc/redeem_customer_bonus', {
      method: 'POST',
      body: JSON.stringify({
        p_restaurant_id: restaurant.id,
        p_customer_id: customerId,
        p_amount: redeemAmount
      })
    });
    return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify(result) };
  } catch (error) {
    console.error('redeem-bonus error:', error);
    const clientError = /Aktiv bonus yoxdur|bonus balansından çox|Müştəri kartı tapılmadı|Restoran tapılmadı/i.test(error.message || '');
    return {
      statusCode: clientError ? 422 : 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: clientError ? error.message : 'Bonus əməliyyatı tamamlanmadı.' })
    };
  }
};

exports.handler = secureHandler('redeem-bonus', { limit: 20 }, exports.handler);
