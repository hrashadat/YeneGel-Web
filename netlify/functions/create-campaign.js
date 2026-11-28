const { constantTimeEqual, isBoundedString, isValidRestaurantSlug, parseJsonObject } = require('../lib/request');
const { getSupabaseConfig, getSupabaseErrorMessage, sbFetch } = require('../lib/supabase');
const { secureHandler } = require('../lib/security');
const { randomUUID } = require('crypto');

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const body = parseJsonObject(event.body);
    const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : '';
    const code = typeof body?.accessCode === 'string' ? body.accessCode.trim() : '';
    const hours = Number(body?.hours);
    const customerIds = Array.isArray(body?.customer_ids) ? [...new Set(body.customer_ids)].filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 500) : [];
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!isValidRestaurantSlug(slug) || !code || !isBoundedString(code, 256) || !Number.isInteger(hours) || hours < 1 || hours > 720 || !customerIds.length || !message || message.length > 2000) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Admin kodu, müştəri, mesaj və 1–720 saat müddət tələb olunur.' }) };
    }
    const { url, key } = getSupabaseConfig();
    const restaurants = await sbFetch(url, key, `restaurants?slug=eq.${encodeURIComponent(slug)}&is_active=eq.true&select=id,admin_code`);
    const restaurant = restaurants?.[0];
    if (!restaurant || !constantTimeEqual(String(restaurant.admin_code || '').trim(), code)) return { statusCode: 401, body: JSON.stringify({ error: 'Admin kodu yanlışdır.' }) };
    const ownedCustomers = await sbFetch(url, key, `customers?restaurant_id=eq.${encodeURIComponent(restaurant.id)}&id=in.(${customerIds.join(',')})&select=id,phone`);
    const eligibleIds = new Set((ownedCustomers || []).map(customer => customer.id));
    const validIds = customerIds.filter(id => eligibleIds.has(id));
    if (!validIds.length) return { statusCode: 400, body: JSON.stringify({ error: 'Seçilmiş müştərilər tapılmadı.' }) };
    const expiresAt = new Date(Date.now() + hours * 3600000).toISOString();
    const campaignId = randomUUID();
    await sbFetch(url, key, 'bonus_boosts', { method: 'POST', body: JSON.stringify(validIds.map(customer_id => ({ campaign_id: campaignId, restaurant_id: restaurant.id, customer_id, multiplier: 2, starts_at: new Date().toISOString(), expires_at: expiresAt }))) });
    await sbFetch(url, key, 'campaign_logs', { method: 'POST', body: JSON.stringify(validIds.map(customer_id => ({ restaurant_id: restaurant.id, campaign_id: campaignId, customer_id, channel: 'manual', message, status: 'prepared', expires_at: expiresAt }))) });
    return { statusCode: 201, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ expires_at: expiresAt, count: validIds.length }) };
  } catch (error) {
    console.error('create-campaign error:', error);
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: getSupabaseErrorMessage(error), code: error.code || 'SERVER_ERROR' }) };
  }
};
exports.handler = secureHandler('create-campaign', { limit: 10, preserveServerErrorResponse: true }, exports.handler);
