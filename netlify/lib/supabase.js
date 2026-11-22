function getSupabaseUrl() {
  const value = process.env.SUPABASE_URL?.trim();
  if (!value) {
    throw new Error('SUPABASE_URL is not configured.');
  }

  const url = URL.parse(value);
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
      url.href.includes('?') || url.href.includes('#')) {
    throw new Error('SUPABASE_URL must be an HTTP(S) base URL without credentials, a query, or a fragment.');
  }

  return url.href.replace(/\/+$/, '');
}

module.exports = { getSupabaseUrl };
