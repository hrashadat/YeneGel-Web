const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { normalizeCard } = require('../lib/loyalty');

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
  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Method Not Allowed' })
      };
    }

    const slug = String(event.queryStringParameters?.slug || 'kaya').trim().toLowerCase();
    const visitorToken = String(event.queryStringParameters?.visitorToken || '').trim();
    const { url, key } = getSupabaseConfig();

    const restaurants = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,name,stamp_goal,reward_text,about,address,phone,instagram,menu_json,bonus_mode,bonus_fixed_amount,bonus_percent`
    );

    const restaurant = restaurants?.[0];
    if (!restaurant) {
      return {
        statusCode: 404,
        headers: JSON_HEADERS,
        body: JSON.stringify({ error: 'Restoran tapılmadı.' })
      };
    }

    let card = {
      stamps_count: 0,
      reward_unlocked: false,
      total_spent: 0,
      bonus_balance: 0
    };

    if (visitorToken) {
      const cards = await sbFetch(
        url,
        key,
        `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&visitor_token=eq.${encodeURIComponent(visitorToken)}&select=id,stamps_count,reward_unlocked,last_stamped_at,total_spent,bonus_balance`
      );
      if (cards?.[0]) card = normalizeCard(restaurant, cards[0]);
    }

    return {
      statusCode: 200,
      headers: {
        ...JSON_HEADERS,
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ restaurant, card })
    };
  } catch (err) {
    console.error('get-card error:', err);
    const causeMsg = err?.cause?.code || err?.cause?.message || '';
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        error: 'Server xətası: ' + err.message + (causeMsg ? ` (${causeMsg})` : '')
      })
    };
  }
};
