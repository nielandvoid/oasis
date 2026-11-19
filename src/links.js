const SCHEMES = ['http:', 'https:', 'ftp:', 'ftps:'];

export function normalizeUrl(input) {
  let raw = String(input).trim().replace(/^<(.*)>$/s, '$1');
  const masked = raw.match(/^\[[^\]]*\]\((\S+?)\)$/);
  if (masked) raw = masked[1];
  raw = raw.replace(/\s+/g, '%20');
  if (!raw) return null;
  // a dotless host only counts when the scheme was typed
  const explicit = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw);
  try {
    const url = new URL(explicit ? raw : `https://${raw}`);
    if (!SCHEMES.includes(url.protocol) || !url.hostname) return null;
    if (!explicit && !url.hostname.includes('.') && !url.hostname.includes(':')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function urlKey(input) {
  try {
    const url = new URL(input);
    const keep = [...url.searchParams].filter(([k]) => !/^(utm_|fbclid|gclid|ref$|si$)/i.test(k)).sort(([a], [b]) => a.localeCompare(b));
    const query = keep.map(([k, v]) => `${k}=${v}`).join('&');
    return `${url.hostname.replace(/^www\./i, '').toLowerCase()}${url.port ? `:${url.port}` : ''}${url.pathname.replace(/\/+$/, '')}${query ? `?${query}` : ''}`;
  } catch {
    return String(input).trim().toLowerCase();
  }
}

export const linksOf = (r) => (r?.urls?.length ? r.urls : r?.url ? [r.url] : []);
