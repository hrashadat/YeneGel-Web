const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { constantTimeEqual, isBoundedString, isValidRestaurantSlug, parseJsonObject } = require('../lib/request');
const { secureHandler } = require('../lib/security');
const { getSupabaseConfig, sbFetch } = require('../lib/supabase');

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
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const accessCodeValue = body.accessCode ?? body.adminCode ?? body.admin_code;
    const accessCode = typeof accessCodeValue === 'string' ? accessCodeValue.trim() : '';
    const currentPin = typeof body.current_pin === 'string' ? body.current_pin.trim() : '';

    if (!isValidRestaurantSlug(slug) || !accessCode || !isBoundedString(accessCode, 256) || !/^\d{4}$/.test(currentPin)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Slug, admin kodu və cari kassir PİN kodu tələb olunur.' }) };
    }

    const stampGoalValue = typeof body.stamp_goal === 'number' || typeof body.stamp_goal === 'string'
      ? String(body.stamp_goal).trim()
      : '';
    const stampGoal = /^\d+$/.test(stampGoalValue) ? Number(stampGoalValue) : NaN;
    const cashierPin = typeof body.cashier_pin === 'string' ? body.cashier_pin.trim() : '';
    const bonusMode = typeof body.bonus_mode === 'string' ? body.bonus_mode.trim().toLowerCase() : '';

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
      !(typeof bonusValueInput === 'number' || typeof bonusValueInput === 'string') ||
      !Number.isFinite(bonusValue) ||
      bonusValue < 0 ||
      Math.round(bonusValue * 100) !== bonusValue * 100 ||
      (bonusMode === 'percent' && bonusValue > 100) ||
      (bonusMode === 'fixed' && bonusValue > 99999999.99)
    ) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Bonus dəyərini düzgün daxil edin.' }) };
    }
    if (body.menu_json !== undefined && (!body.menu_json || typeof body.menu_json !== 'object')) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Menyu JSON formatında obyekt və ya siyahı olmalıdır.' }) };
    }
    const boundedFields = [
      [body.reward_text, 45],
      [body.name, 120],
      [body.about, 5000],
      [body.address, 500],
      [body.phone, 40],
      [body.instagram, 255]
    ];
    if (boundedFields.some(([value, maximum]) => value !== undefined && !isBoundedString(value, maximum))) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran məlumatlarının uzunluğu etibarsızdır.' }) };
    }

    const { url, key } = getSupabaseConfig();
    const rows = await sbFetch(
      url,
      key,
      `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,slug,admin_code,pin_code,bonus_fixed_amount,bonus_percent`
    );

    const existing = rows?.[0];
    if (!existing) {
      return { statusCode: 404, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Restoran tapılmadı.' }) };
    }

    if (!constantTimeEqual(String(existing.admin_code || '').trim(), accessCode)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Xüsusi giriş kodu yanlışdır.' }) };
    }
    if (!constantTimeEqual(String(existing.pin_code || '').trim(), currentPin)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Kassir PİN kodu yanlışdır.' }) };
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
    if (body.menu_json !== undefined) patchPayload.menu_json = body.menu_json;

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
    const { admin_code, pin_code, ...safeUpdated } = updatedRow;

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

exports.handler = secureHandler('update-restaurant', { limit: 20, maxBodyBytes: 524288 }, exports.handler);
