const JSON_HEADERS = { 'Content-Type': 'application/json' };
const { constantTimeEqual, isBoundedString, isValidRestaurantSlug, parseJsonObject } = require('../lib/request');
const { secureHandler } = require('../lib/security');
const { getSupabaseConfig, getSupabaseErrorMessage, sbFetch } = require('../lib/supabase');

function fieldError(field, error) {
  return {
    statusCode: 400,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error, field })
  };
}

function validateTextField(value, { minimum, maximum, optional = false }) {
  const text = value === undefined || value === null ? '' : value;
  if (typeof text !== 'string') return 'Mətn formatında daxil edin.';

  const length = Array.from(text.trim()).length;
  if (optional && length === 0) return null;
  if (length < minimum) return `Minimum ${minimum} simvol olmalıdır.`;
  if (length > maximum) return `Maksimum ${maximum} simvol ola bilər.`;
  return null;
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
    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const accessCodeValue = body.accessCode ?? body.adminCode ?? body.admin_code;
    const accessCode = typeof accessCodeValue === 'string' ? accessCodeValue.trim() : '';
    if (!isValidRestaurantSlug(slug) || !accessCode || !isBoundedString(accessCode, 256)) {
      return { statusCode: 400, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Slug, admin kodu və cari personel PİN kodu tələb olunur.' }) };
    }

    const stampGoalValue = typeof body.stamp_goal === 'number' || typeof body.stamp_goal === 'string'
      ? String(body.stamp_goal).trim()
      : '';
    const stampGoal = /^\d+$/.test(stampGoalValue) ? Number(stampGoalValue) : NaN;
    const cashierPin = typeof body.cashier_pin === 'string' ? body.cashier_pin.trim() : '';
    const bonusMode = typeof body.bonus_mode === 'string' ? body.bonus_mode.trim().toLowerCase() : '';
    const campaignHours = Number(body.campaign_default_hours ?? 1);
    const campaignMessage = typeof body.campaign_default_message === 'string' ? body.campaign_default_message.trim() : '';

    if (!Number.isInteger(stampGoal) || stampGoal < 1 || stampGoal > 20) {
      return fieldError('stampGoalInput', 'Möhür sayı 1-20 arası tam ədəd olmalıdır.');
    }

    if (bonusMode !== 'fixed' && bonusMode !== 'percent') {
      return fieldError('bonusModeInput', 'Bonus rejimi düzgün seçilməyib.');
    }
    if (!Number.isInteger(campaignHours) || campaignHours < 1 || campaignHours > 720 || campaignMessage.length > 2000) {
      return fieldError('campaignDefaultHoursInput', 'Kampaniya müddəti 1–720 saat olmalı, mətn 2000 simvoldan çox olmamalıdır.');
    }

    if (cashierPin && !/^\d{4}$/.test(cashierPin)) {
      return fieldError('cashierPinInput', 'Kassir PİN kodu 4 rəqəm olmalıdır.');
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
      return fieldError(
        'bonusValueInput',
        bonusMode === 'percent'
          ? 'Bonus faizi 0-100 arası olmalıdır.'
          : 'Bonus dəyərini düzgün daxil edin.'
      );
    }
    if (body.menu_json !== undefined && (!body.menu_json || typeof body.menu_json !== 'object')) {
      return fieldError('menuInput', 'Menyu JSON formatında obyekt və ya siyahı olmalıdır.');
    }
    const textFields = [
      { key: 'name', field: 'restaurantNameInput', minimum: 2, maximum: 200 },
      { key: 'about', field: 'aboutInput', minimum: 2, maximum: 10000, optional: true },
      { key: 'address', field: 'addressInput', minimum: 2, maximum: 1000 },
      { key: 'reward_text', field: 'rewardTextInput', minimum: 0, maximum: 80, optional: true },
      { key: 'phone', field: 'restaurantPhoneInput', minimum: 0, maximum: 50, optional: true },
      { key: 'instagram', field: 'instagramInput', minimum: 0, maximum: 255, optional: true }
    ];
    for (const textField of textFields) {
      const error = validateTextField(body[textField.key], textField);
      if (error) return fieldError(textField.field, error);
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

    if (!String(existing.admin_code || '').trim()) {
      return { statusCode: 403, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Bu restoran üçün admin giriş kodu təyin edilməyib.', code: 'ADMIN_CODE_NOT_CONFIGURED' }) };
    }
    if (!constantTimeEqual(String(existing.admin_code || '').trim(), accessCode)) {
      return { statusCode: 401, headers: JSON_HEADERS, body: JSON.stringify({ error: 'Xüsusi giriş kodu yanlışdır.' }) };
    }

    const patchPayload = {
      stamp_goal: stampGoal,
      bonus_mode: bonusMode,
      reward_text: String(body.reward_text ?? 'BONUS').trim(),
      name: String(body.name ?? '').trim(),
      about: String(body.about ?? '').trim(),
      address: String(body.address ?? '').trim(),
      phone: String(body.phone ?? '').trim(),
      instagram: String(body.instagram ?? '').trim(),
      campaign_default_hours: campaignHours,
      campaign_default_message: campaignMessage
    };
    if (body.menu_json !== undefined) patchPayload.menu_json = body.menu_json;
    if (cashierPin) patchPayload.pin_code = cashierPin;

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
    console.error('update-restaurant error:', err);
    return {
      statusCode: 500,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: getSupabaseErrorMessage(err), code: err.code || 'SERVER_ERROR' })
    };
  }
};

exports.handler = secureHandler('update-restaurant', {
  limit: 20,
  maxBodyBytes: 524288,
  preserveServerErrorResponse: true
}, exports.handler);
