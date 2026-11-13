// Proxy zur osu!-API v2 (Token bleibt im HttpOnly-Cookie, nur erlaubte Pfade)
exports.handler = async (e) => {
  const tok = /osu_t=([^;]+)/.exec(e.headers.cookie || '')?.[1];
  if (!tok) return { statusCode: 401, body: 'nicht eingeloggt' };
  const { path, ...rest } = e.queryStringParameters || {};
  if (!/^\/(me\/osu|users\/\d+\/scores\/(recent|best)|scores\/([a-z]+\/)?\d+\/download)$/.test(path || '')) return { statusCode: 400, body: 'Pfad nicht erlaubt' };
  const r = await fetch('https://osu.ppy.sh/api/v2' + path + '?' + new URLSearchParams(rest), {
    headers: { Authorization: 'Bearer ' + tok, 'x-api-version': '20220705', Accept: 'application/json' }
  });
  const buf = Buffer.from(await r.arrayBuffer());
  return { statusCode: r.status, headers: { 'Content-Type': r.headers.get('content-type') || 'application/json' }, body: buf.toString('base64'), isBase64Encoded: true };
};
