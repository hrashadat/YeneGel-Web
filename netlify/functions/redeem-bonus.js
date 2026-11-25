const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { getStampGoal, normalizeCard } = require('../lib/loyalty');
const { parseJsonObject } = require('../lib/request');

function getSupabaseConfig() {
  const rawUrl = (process.env.SUPABASE_URL || '').trim();
  const markdownMatch = rawUrl.match(/\((https?:\/\/[^)]+)\)/);
  const url = (markdownMatch ? markdownMatch[1] : rawUrl)
    .replace(/^\[|\]$/g, '')
    .replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !key) {
    throw new Error('SUPABASE_URL və ya SUPABASE_SERVICE_ROLE_KEY təyin edilməyib.');
  }
  return { url, key };
}

async function sbFetch(url, key, path, options = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `Supabase xətası (${res.status})`);
  }
  return data;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const body = parseJsonObject(event.body);
    if (!body) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' }) };
    }
    const slug = String(body.slug || 'kaya').trim().toLowerCase();
    const visitorToken = String(body.visitorToken || '').trim();
    const pin = String(body.pin || '').trim();

    if (!visitorToken || !pin) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Məlumat natamamdır.' }) };
    }

    if (!/^\d{4}$/.test(pin)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'PİN kod tam 4 rəqəmdən ibarət olmalıdır.' }) };
    }

    const { url, key } = getSupabaseConfig();

    const restaurants = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=*`
    );
    const restaurant = restaurants?.[0];

    if (!restaurant) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }

    if (pin !== String(restaurant.pin_code || '').trim()) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Kassir PİN kodu yanlışdır.' }) };
    }

    const cards = await sbFetch(
      url,
      key,
      `loyalty_cards?restaurant_id=eq.${restaurant.id}&visitor_token=eq.${encodeURIComponent(visitorToken)}&select=*`
    );
    const storedCard = cards?.[0];

    if (!storedCard) {
      return { statusCode: 422, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Aktiv bonus yoxdur.' }) };
    }

    const card = normalizeCard(restaurant, storedCard);
    if (card.stamps_count < getStampGoal(restaurant)) {
      return { statusCode: 422, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Aktiv bonus yoxdur.' }) };
    }

    const redeemedBonus = card.bonus_balance;

    const goal = getStampGoal(restaurant);
    const updatedCards = await sbFetch(
      url,
      key,
      `loyalty_cards?id=eq.${encodeURIComponent(card.id)}&stamps_count=gte.${goal}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          stamps_count: 0,
          reward_unlocked: false,
          bonus_balance: 0,
          total_spent: 0
        })
      }
    );
    if (!updatedCards?.[0]) {
      return { statusCode: 422, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Aktiv bonus yoxdur.' }) };
    }

    await sbFetch(url, key, 'card_transactions', {
      method: 'POST',
      body: JSON.stringify({
        restaurant_id: restaurant.id,
        card_id: card.id,
        visitor_token: visitorToken,
        tx_type: 'redeem',
        bill_amount: 0,
        bonus_delta: -Math.abs(redeemedBonus)
      })
    });

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        message: `${restaurant.reward_text || 'BONUS'} istifadə edildi və dairələr sıfırlandı!`,
        stamps_count: 0,
        reward_unlocked: false,
        bonus_balance: 0,
        total_spent: 0
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Server xətası: ' + err.message })
    };
  }
};
