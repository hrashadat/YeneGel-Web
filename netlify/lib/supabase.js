function cleanEnvValue(value) {
  let result = String(value || '').trim();
  if (
    result.length >= 2 &&
    ((result.startsWith('"') && result.endsWith('"')) ||
      (result.startsWith("'") && result.endsWith("'")))
  ) {
    result = result.slice(1, -1).trim();
  }
  return result;
}

function getSupabaseConfig() {
  const rawUrl = cleanEnvValue(process.env.SUPABASE_URL);
  const markdownMatch = rawUrl.match(/\((https?:\/\/[^)]+)\)/);
  const url = (markdownMatch ? markdownMatch[1] : rawUrl)
    .replace(/^\[|\]$/g, '')
    .replace(/\/+$/, '');
  const key = cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !key) {
    throw new Error('SUPABASE_URL və ya SUPABASE_SERVICE_ROLE_KEY təyin edilməyib.');
  }
  const keyParts = key.split('.');
  if (keyParts.length === 3) {
    let payload;
    try {
      payload = JSON.parse(
        Buffer.from(keyParts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      );
    } catch {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY JWT formatı etibarsızdır.');
    }
    if (payload?.role && payload.role !== 'service_role') {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY service_role icazəli açar olmalıdır.');
    }
  }
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error('SUPABASE_URL düzgün URL formatında deyil.');
  }
  if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
    throw new Error('SUPABASE_URL http və ya https ünvanı olmalıdır.');
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
    const error = new Error((data && (data.message || data.error)) || `Supabase xətası (${res.status})`);
    error.code = data && data.code;
    error.details = data && data.details;
    error.hint = data && data.hint;
    throw error;
  }
  return data;
}

function getSupabaseErrorMessage(error) {
  if (error?.code === '42501') {
    return 'Supabase cədvəl icazəsi yoxdur. service_role GRANT migration-ını Supabase SQL Editor-də tətbiq edin.';
  }
  return `Server xətası: ${error?.message || 'Naməlum xəta.'}`;
}

module.exports = { getSupabaseConfig, getSupabaseErrorMessage, sbFetch };
