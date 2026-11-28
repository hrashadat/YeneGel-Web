const { sbFetch } = require('./supabase');

async function ensureCustomerCard(url, key, restaurantId, customerId, legacyToken = '') {
  const cards = await sbFetch(
    url,
    key,
    `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurantId)}&visitor_token=eq.${encodeURIComponent(customerId)}&select=id`
  );
  if (cards?.length) return;

  const legacyCards = /^v_[A-Za-z0-9_-]{1,180}$/.test(legacyToken)
    ? await sbFetch(
      url,
      key,
      `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurantId)}&visitor_token=eq.${encodeURIComponent(legacyToken)}&select=id`
    )
    : [];
  if (legacyCards?.[0]) {
    const migrated = await sbFetch(
      url,
      key,
      `loyalty_cards?id=eq.${encodeURIComponent(legacyCards[0].id)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ visitor_token: customerId })
      }
    );
    if (!migrated?.[0]) throw new Error('Əvvəlki loyallıq kartını yeni QR kodla əlaqələndirmək mümkün olmadı.');
    return;
  }

  try {
    await sbFetch(url, key, 'loyalty_cards', {
      method: 'POST',
      body: JSON.stringify({
        restaurant_id: restaurantId,
        visitor_token: customerId,
        stamps_count: 0,
        total_spent: 0,
        bonus_balance: 0
      })
    });
  } catch (error) {
    if (error.code !== '23505') throw error;
    const concurrentCard = await sbFetch(
      url,
      key,
      `loyalty_cards?restaurant_id=eq.${encodeURIComponent(restaurantId)}&visitor_token=eq.${encodeURIComponent(customerId)}&select=id`
    );
    if (!concurrentCard?.[0]) throw error;
  }
}

module.exports = { ensureCustomerCard };
