const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Yalnız POST sorğularına icazə verilir.' }),
    };
  }

  if (!supabaseUrl || !supabaseKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Serverdə SUPABASE_URL və ya Supabase açarı təyin edilməyib.',
      }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const slug = String(body.slug || '').trim().toLowerCase();
    const adminCode = String(body.adminCode || body.admin_code || '').trim();

    if (!slug || !adminCode) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Restoran kodu (slug) və giriş kodu tələb olunur.' }),
      };
    }

    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select(
        'id, slug, name, admin_code, pin_code, stamp_goal, bonus_mode, bonus_fixed_amount, bonus_percent, reward_text, about, address, phone, instagram'
      )
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Baza sorğusunda xəta: ' + error.message }),
      };
    }

    if (!restaurant || String(restaurant.admin_code || '').trim() !== adminCode) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Kod və ya restoran adı yanlışdır.' }),
      };
    }

    const { admin_code, ...safeRestaurant } = restaurant;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        restaurant: safeRestaurant,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Daxili server xətası: ' + err.message }),
    };
  }
};
