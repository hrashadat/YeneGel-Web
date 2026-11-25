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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const slug = String(body.slug || '').trim().toLowerCase();
    const accessCode = String(body.accessCode || '').trim();

    if (!slug || !accessCode) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Slug və giriş kodu tələb olunur.' }) };
    }

    const { url, key } = getSupabaseConfig();
    const rows = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,name,pin_code,admin_code,stamp_goal,reward_text,about,address,phone,instagram,bonus_mode,bonus_fixed_amount,bonus_percent`
    );

    const restaurant = rows?.[0];
    if (!restaurant) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }

    if (!restaurant.admin_code || String(restaurant.admin_code).trim() !== accessCode) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Xüsusi giriş kodu yanlışdır.' }) };
    }

    const { admin_code, ...safeRestaurant } = restaurant;
    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ restaurant: safeRestaurant })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Server xətası: ' + err.message })
    };
  }
};
```[cite: 1, 2, 3, 4]

---

### 4. `netlify/functions/update-restaurant.js`

```javascript
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

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const slug = String(body.slug || '').trim().toLowerCase();
    const accessCode = String(body.accessCode || '').trim();

    if (!slug || !accessCode) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Slug və giriş kodu tələb olunur.' }) };
    }

    const stampGoal = Number(body.stamp_goal);
    const cashierPin = String(body.cashier_pin || '').trim();
    const bonusMode = String(body.bonus_mode || 'fixed').toLowerCase() === 'percent' ? 'percent' : 'fixed';

    if (!Number.isInteger(stampGoal) || stampGoal < 1 || stampGoal > 20) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Çəntik sayı 1-20 arası tam ədəd olmalıdır.' }) };
    }

    if (!/^\d{4}$/.test(cashierPin)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Kassir PİN kodu 4 rəqəm olmalıdır.' }) };
    }

    const { url, key } = getSupabaseConfig();
    const rows = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,admin_code,bonus_fixed_amount,bonus_percent`
    );

    const existing = rows?.[0];
    if (!existing) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }

    if (!existing.admin_code || String(existing.admin_code).trim() !== accessCode) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Xüsusi giriş kodu yanlışdır.' }) };
    }

    const patchPayload = {
      stamp_goal: stampGoal,
      pin_code: cashierPin,
      bonus_mode: bonusMode,
      reward_text: String(body.reward_text ?? 'BONUS').trim(),
      name: String(body.name ?? '').trim(),
      about: String(body.about ?? '').trim(),
      address: String(body.address ?? '').trim(),
      phone: String(body.phone ?? '').trim(),
      instagram: String(body.instagram ?? '').trim()
    };

    if (bonusMode === 'percent' && body.bonus_percent !== undefined) {
      patchPayload.bonus_percent = Number(body.bonus_percent);
    } else if (bonusMode === 'fixed' && body.bonus_fixed_amount !== undefined) {
      patchPayload.bonus_fixed_amount = Number(body.bonus_fixed_amount);
    }

    const updated = await sbFetch(
      url,
      key,
      `restaurants?id=eq.${encodeURIComponent(existing.id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patchPayload)
      }
    );

    const updatedRow = updated?.[0] || {};
    const { admin_code, ...safeUpdated } = updatedRow;

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ restaurant: safeUpdated })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Server xətası: ' + err.message })
    };
  }
};
```[cite: 1, 2, 3, 4]

---

### 5. `schema.sql`

```sql
alter table public.restaurants
  add column if not exists admin_code text,
  add column if not exists pin_code text default '1234',
  add column if not exists stamp_goal integer default 5,
  add column if not exists bonus_mode text default 'fixed',
  add column if not exists bonus_fixed_amount numeric(10,2) default 10,
  add column if not exists bonus_percent numeric(5,2) default 10,
  add column if not exists reward_text text default 'BONUS',
  add column if not exists about text default '',
  add column if not exists address text default '',
  add column if not exists phone text default '',
  add column if not exists instagram text default '';

update public.restaurants
set admin_code = 'KAYA-8841'
where slug = 'kaya';
