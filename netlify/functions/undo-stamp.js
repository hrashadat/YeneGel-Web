const JSON_HEADERS = { 'Content-Type': 'application/json' };

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

function roundMoney(val) {
  return Math.max(0, Math.round((Number(val) + Number.EPSILON) * 100) / 100);
}

function calculateBonusAmount(restaurant, totalSpent) {
  const mode = String(restaurant.bonus_mode || 'fixed').trim().toLowerCase();
  if (mode === 'percent') {
    const pct = Number(restaurant.bonus_percent || 0);
    return roundMoney((Number(totalSpent || 0) * pct) / 100);
  }
  return roundMoney(Number(restaurant.bonus_fixed_amount ?? 10));
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
    const body = JSON.parse(event.body || '{}');
    const slug = String(body.slug || 'kaya').trim().toLowerCase();
    const visitorToken = String(body.visitorToken || '').trim();
    const pin = String(body.pin || '').trim();

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

    const { url, key } = getSupabaseConfig();

    const restaurants = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,name,stamp_goal,pin_code,bonus_mode,bonus_fixed_amount,bonus_percent`
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

    const cards = await sbFetch(
      url,
      key,
      `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&visitor_token=eq.${encodeURIComponent(visitorToken)}&select=id,stamps_count,reward_unlocked,total_spent,bonus_balance`
    );

    const card = cards?.[0];
    if (!card || Number(card.stamps_count || 0) <= 0) {
      return {
        statusCode: 422,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Ləğv ediləcək xal yoxdur.' })
      };
    }

    const lastTxs = await sbFetch(
      url,
      key,
      `card_transactions?card_id=eq.${encodeURIComponent(card.id)}&tx_type=eq.stamp&order=created_at.desc&limit=1&select=id,bill_amount`
    );
    const lastTx = lastTxs?.[0] || null;
    const deductedAmount = Number(lastTx?.bill_amount || 0);

    const goal = Number(restaurant.stamp_goal || 5);
    const nextStamps = Math.max(0, Number(card.stamps_count || 0) - 1);
    const nextTotalSpent = nextStamps === 0 ? 0 : roundMoney(Number(card.total_spent || 0) - deductedAmount);
    const unlocked = nextStamps >= goal;
    const nextBonusBalance = unlocked ? calculateBonusAmount(restaurant, nextTotalSpent) : 0;

    const updated = await sbFetch(
      url,
      key,
      `loyalty_cards?id=eq.${encodeURIComponent(card.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          stamps_count: nextStamps,
          reward_unlocked: unlocked,
          total_spent: nextTotalSpent,
          bonus_balance: nextBonusBalance
        })
      }
    );

    if (lastTx?.id) {
      await sbFetch(
        url,
        key,
        `card_transactions?id=eq.${encodeURIComponent(lastTx.id)}`,
        { method: 'DELETE' }
      );
    }

    const updatedCard = updated?.[0] || {
      ...card,
      stamps_count: nextStamps,
      reward_unlocked: unlocked,
      total_spent: nextTotalSpent,
      bonus_balance: nextBonusBalance
    };

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        card: updatedCard,
        stamps_count: updatedCard.stamps_count,
        reward_unlocked: updatedCard.reward_unlocked,
        total_spent: updatedCard.total_spent,
        bonus_balance: updatedCard.bonus_balance
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