const { getSupabaseUrl } = require('../lib/supabase');

exports.handler = async (event) => {
  try {
    const slug = event.queryStringParameters?.slug || 'kaya';
    const visitorToken = event.queryStringParameters?.visitorToken;

    const supabaseUrl = getSupabaseUrl();
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const restRes = await fetch(
      `${supabaseUrl}/rest/v1/restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,name,stamp_goal,reward_text,about,menu_json`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    const restaurants = await restRes.json();
    const restaurant = restaurants[0];

    if (!restaurant) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Restoran tapılmadı.' })
      };
    }

    let card = { stamps_count: 0, reward_unlocked: false };

    if (visitorToken) {
      const cardRes = await fetch(
        `${supabaseUrl}/rest/v1/loyalty_cards?restaurant_id=eq.${restaurant.id}&visitor_token=eq.${encodeURIComponent(visitorToken)}&select=id,stamps_count,reward_unlocked,last_stamped_at`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`
          }
        }
      );
      const cards = await cardRes.json();

      if (cards[0]) {
        card = cards[0];
      } else {
        const createRes = await fetch(`${supabaseUrl}/rest/v1/loyalty_cards`, {
          method: 'POST',
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation'
          },
          body: JSON.stringify({
            restaurant_id: restaurant.id,
            visitor_token: visitorToken,
            stamps_count: 0,
            reward_unlocked: false
          })
        });
        const created = await createRes.json();
        if (created[0]) card = created[0];
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant, card })
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Server xətası: ' + err.message })
    };
  }
};