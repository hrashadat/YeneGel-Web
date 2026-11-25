const JSON_HEADERS = { 'Content-Type': 'application/json' };
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
    return { statusCode: 405, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
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
    const slug = String(body.slug || '').trim().toLowerCase();
    const accessCode = String(body.accessCode || body.adminCode || body.admin_code || '').trim();

    if (!slug || !accessCode) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Slug və giriş kodu tələb olunur.' }) };
    }

    const stampGoalValue = String(body.stamp_goal ?? '').trim();
    const stampGoal = /^\d+$/.test(stampGoalValue) ? Number(stampGoalValue) : NaN;
    const cashierPin = String(body.cashier_pin || '').trim();
    const bonusMode = String(body.bonus_mode || '').trim().toLowerCase();

    if (!Number.isInteger(stampGoal) || stampGoal < 1 || stampGoal > 20) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Möhür sayı 1-20 arası tam ədəd olmalıdır.' }) };
    }

    if (bonusMode !== 'fixed' && bonusMode !== 'percent') {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Bonus rejimi düzgün seçilməyib.' }) };
    }

    if (!/^\d{4}$/.test(cashierPin)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Kassir PİN kodu 4 rəqəm olmalıdır.' }) };
    }

    const bonusValueInput = bonusMode === 'percent' ? body.bonus_percent : body.bonus_fixed_amount;
    const bonusValue = Number(bonusValueInput);
    if (
      bonusValueInput === undefined ||
      bonusValueInput === null ||
      (typeof bonusValueInput === 'string' && !bonusValueInput.trim()) ||
      !Number.isFinite(bonusValue) ||
      bonusValue < 0
    ) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Bonus dəyərini düzgün daxil edin.' }) };
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

    patchPayload[bonusMode === 'percent' ? 'bonus_percent' : 'bonus_fixed_amount'] = bonusValue;

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

    const updatedRow = updated?.[0];
    if (!updatedRow) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran ayarları yenilənmədi.' }) };
    }
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
