const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { getBonusBalance, getStampCount, getStampGoal, getTotalSpent, normalizeCard, roundMoney } = require('../lib/loyalty');
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
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    throw new Error((data && (data.message || data.error)) || `Supabase xətası (${res.status})`);
  }
  return data;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const body = parseJsonObject(event.body);
    if (!body) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Sorğu məlumatı etibarsızdır.' })
      };
    }
    const slug = String(body.slug || 'kaya').trim().toLowerCase();
    const pin = String(body.pin || body.pin_code || '').trim();
    const visitorToken = String(body.visitorToken || '').trim();
    const rawAmount = Number(body.amount);

    if (!visitorToken) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'visitorToken tapılmadı.' })
      };
    }

    if (!/^\d{4}$/.test(pin)) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'PİN kod tam 4 rəqəmdən ibarət olmalıdır.' })
      };
    }

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Düzgün hesab məbləği daxil edin.' })
      };
    }

    const billAmount = roundMoney(rawAmount);
    if (!Number.isFinite(billAmount) || billAmount <= 0) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Hesab məbləği 0.01 AZN-dən az ola bilməz.' })
      };
    }

    const { url, key } = getSupabaseConfig();

    const restaurants = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,name,stamp_goal,pin_code,cooldown_hours,bonus_mode,bonus_fixed_amount,bonus_percent`
    );

    const restaurant = restaurants?.[0];
    if (!restaurant) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Restoran tapılmadı.' })
      };
    }

    if (String(restaurant.pin_code || '').trim() !== pin) {
      return {
        statusCode: 401,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Kassir PİN kodu yanlışdır.' })
      };
    }

    const existingCards = await sbFetch(
      url,
      key,
      `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&visitor_token=eq.${encodeURIComponent(visitorToken)}&select=id,stamps_count,reward_unlocked,last_stamped_at,total_spent,bonus_balance`
    );

    const goal = getStampGoal(restaurant);
    const existingCard = existingCards?.[0] || null;
    let currentCard = existingCard ? normalizeCard(restaurant, existingCard) : null;
    const currentStamps = getStampCount(currentCard);
    const prevSpent = getTotalSpent(currentCard);
    const prevBonusBalance = getBonusBalance(restaurant, currentStamps, prevSpent);
    const nextTotalSpent = roundMoney(prevSpent + billAmount);
    if (!Number.isFinite(nextTotalSpent)) {
      return {
        statusCode: 400,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Hesab məbləği çox böyükdür.' })
      };
    }

    const nextStamps = currentStamps >= goal ? currentStamps : currentStamps + 1;
    const unlocked = nextStamps >= goal;
    const nextBonusBalance = getBonusBalance(restaurant, nextStamps, nextTotalSpent);
    const nextCardValues = {
      stamps_count: nextStamps,
      reward_unlocked: unlocked,
      total_spent: nextTotalSpent,
      bonus_balance: nextBonusBalance,
      last_stamped_at: new Date().toISOString()
    };

    if (currentCard) {
      const updated = await sbFetch(
        url,
        key,
        `loyalty_cards?id=eq.${encodeURIComponent(currentCard.id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify(nextCardValues)
        }
      );
      if (!updated?.[0]) throw new Error('Kart yenilənmədi.');
      currentCard = normalizeCard(restaurant, updated[0]);
    } else {
      const inserted = await sbFetch(
        url,
        key,
        'loyalty_cards',
        {
          method: 'POST',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            visitor_token: visitorToken,
            ...nextCardValues
          })
        }
      );
      if (!inserted?.[0]) throw new Error('Kart yaradılmadı.');
      currentCard = normalizeCard(restaurant, inserted[0]);
    }

    if (!currentCard.id) throw new Error('Kart ID-si cavabda tapılmadı.');

    await sbFetch(url, key, 'card_transactions', {
      method: 'POST',
      body: JSON.stringify({
        restaurant_id: restaurant.id,
        card_id: currentCard.id,
        visitor_token: visitorToken,
        tx_type: 'stamp',
        bill_amount: billAmount,
        bonus_delta: currentCard.bonus_balance - prevBonusBalance
      })
    });

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        card: currentCard,
        stamps_count: currentCard.stamps_count,
        reward_unlocked: currentCard.reward_unlocked,
        total_spent: currentCard.total_spent,
        bonus_balance: currentCard.bonus_balance
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
