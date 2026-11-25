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
  return Math.round((Number(val) + Number.EPSILON) * 100) / 100;
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
    const slug = (body.slug || 'kaya').trim().toLowerCase();
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

    const goal = Number(restaurant.stamp_goal || 5);
    let currentCard = existingCards?.[0] || null;
    const prevSpent = Number(currentCard?.total_spent || 0);
    const prevBonusBalance = Number(currentCard?.bonus_balance || 0);
    const nextTotalSpent = roundMoney(prevSpent + billAmount);

    const nextStamps = Math.min((currentCard?.stamps_count || 0) + 1, goal);
    const unlocked = nextStamps >= goal;
    const computedBonus = calculateBonusAmount(restaurant, nextTotalSpent);
    const hasAccruedBonus = String(restaurant.bonus_mode || 'fixed').trim().toLowerCase() === 'percent';
    const nextBonusBalance = unlocked || hasAccruedBonus ? computedBonus : 0;

    if (currentCard) {
      const updated = await sbFetch(
        url,
        key,
        `loyalty_cards?id=eq.${encodeURIComponent(currentCard.id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            stamps_count: nextStamps,
            reward_unlocked: unlocked,
            total_spent: nextTotalSpent,
            bonus_balance: nextBonusBalance,
            last_stamped_at: new Date().toISOString()
          })
        }
      );
      currentCard = updated?.[0] || {
        ...currentCard,
        stamps_count: nextStamps,
        reward_unlocked: unlocked,
        total_spent: nextTotalSpent,
        bonus_balance: nextBonusBalance
      };
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
            stamps_count: nextStamps,
            reward_unlocked: unlocked,
            total_spent: nextTotalSpent,
            bonus_balance: nextBonusBalance,
            last_stamped_at: new Date().toISOString()
          })
        }
      );
      currentCard = inserted?.[0] || {
        stamps_count: nextStamps,
        reward_unlocked: unlocked,
        total_spent: nextTotalSpent,
        bonus_balance: nextBonusBalance
      };
    }

    if (currentCard?.id) {
      await sbFetch(url, key, 'card_transactions', {
        method: 'POST',
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          card_id: currentCard.id,
          visitor_token: visitorToken,
          tx_type: 'stamp',
          bill_amount: billAmount,
          bonus_delta: nextBonusBalance - prevBonusBalance
        })
      });
    }

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
