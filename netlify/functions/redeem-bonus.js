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
    const card = (await cardRes.json())[0];

    if (!card || !card.reward_unlocked) {
      return { statusCode: 422, body: JSON.stringify({ error: 'Aktiv bonus yoxdur.' }) };
    }

    await fetch(`${supabaseUrl}/rest/v1/loyalty_cards?id=eq.${card.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        stamps_count: 0,
        reward_unlocked: false
      })
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `${restaurant.reward_text} istifadə edildi və dairələr sıfırlandı!`,
        stamps_count: 0,
        reward_unlocked: false
      })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server xətası: ' + err.message })
    };
  }
};