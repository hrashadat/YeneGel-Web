exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const { slug = 'kaya', visitorToken, pin } = JSON.parse(event.body || '{}');
    if (!visitorToken || !pin) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Məlumat natamamdır.' }) };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    };

    const restRes = await fetch(
      `${supabaseUrl}/rest/v1/restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=*`,
      { headers }
    );
    const restaurant = (await restRes.json())[0];

    if (!restaurant) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }

    if (String(pin).trim() !== String(restaurant.pin_code).trim()) {
      return { statusCode: 422, body: JSON.stringify({ error: 'PİN kod yanlışdır.' }) };
    }

    const cardRes = await fetch(
      `${supabaseUrl}/rest/v1/loyalty_cards?restaurant_id=eq.${restaurant.id}&visitor_token=eq.${encodeURIComponent(visitorToken)}&select=*`,
      { headers }
    );
    let card = (await cardRes.json())[0];

    if (!card) {
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/loyalty_cards`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=representation' },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          visitor_token: visitorToken,
          stamps_count: 0,
          reward_unlocked: false
        })
      });
      card = (await insertRes.json())[0];
    }

    if (card.reward_unlocked) {
      return {
        statusCode: 422,
        body: JSON.stringify({ error: '5 dairə artıq dolub! Əvvəlcə bonusu işlədin.' })
      };
    }

    if (card.last_stamped_at) {
      const diffHours = (Date.now() - new Date(card.last_stamped_at).getTime()) / (1000 * 60 * 60);
      if (diffHours < Number(restaurant.cooldown_hours || 4)) {
        return {
          statusCode: 429,
          body: JSON.stringify({
            error: `Növbəti xal üçün ${restaurant.cooldown_hours} saat gözləmək lazımdır.`
          })
        };
      }
    }

    const nextStamps = Math.min(Number(card.stamps_count || 0) + 1, Number(restaurant.stamp_goal || 5));
    const unlocked = nextStamps >= Number(restaurant.stamp_goal || 5);

    await fetch(`${supabaseUrl}/rest/v1/loyalty_cards?id=eq.${card.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        stamps_count: nextStamps,
        last_stamped_at: new Date().toISOString(),
        reward_unlocked: unlocked
      })
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: unlocked
          ? `Təbriklər! ${restaurant.reward_text} aktiv oldu!`
          : 'Xal əlavə olundu!',
        stamps_count: nextStamps,
        reward_unlocked: unlocked
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server xətası: ' + err.message })
    };
  }
};