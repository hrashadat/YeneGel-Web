function normalizeAzerbaijanPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('994') && local.length === 12) local = local.slice(3);
  else if (local.startsWith('0') && local.length === 10) local = local.slice(1);
  return /^\d{9}$/.test(local) ? local : '';
}

function formatAzerbaijanPhone(value) {
  const local = normalizeAzerbaijanPhone(value) || String(value || '').replace(/\D/g, '').replace(/^(994|0)/, '').slice(0, 9);
  return [local.slice(0, 2), local.slice(2, 5), local.slice(5, 7), local.slice(7, 9)].filter(Boolean).join('-');
}

function toWhatsAppNumber(value) {
  const local = normalizeAzerbaijanPhone(value);
  return local ? `994${local}` : '';
}

module.exports = { formatAzerbaijanPhone, normalizeAzerbaijanPhone, toWhatsAppNumber };
