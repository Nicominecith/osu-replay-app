// Skin-Liste (Vorschau + Download-Link) für die Skin-Galerie
exports.handler = async (e) => {
  const q = e.queryStringParameters || {};
  if (!/osu_t=/.test(e.headers.cookie || '')) return { statusCode: 401, body: '{"error":"nicht eingeloggt"}' };
  const n = Math.min(50, Math.max(1, +q.size || 47));
  const r = await fetch(`https://apis.issou.best/ordr/skins?pageSize=${n}&page=1&search=${encodeURIComponent(q.search || '')}`);
  return { statusCode: r.status, headers: { 'Content-Type': 'application/json' }, body: await r.text() };
};
