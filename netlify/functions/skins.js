// Skin-Liste (Vorschau + Download-Link) für die Skin-Galerie – seitenweise (max. 50 pro Seite)
exports.handler = async (e) => {
  const q = e.queryStringParameters || {};
  if (!/osu_t=/.test(e.headers.cookie || '')) return { statusCode: 401, body: '{"error":"nicht eingeloggt"}' };
  const n = Math.min(50, Math.max(1, +q.size || 50)), p = Math.min(20, Math.max(1, +q.page || 1));
  try {
    const r = await fetch(`https://apis.issou.best/ordr/skins?pageSize=${n}&page=${p}&search=${encodeURIComponent(q.search || '')}`, { signal: AbortSignal.timeout(8000) });
    return { statusCode: r.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, max-age=900' }, body: await r.text() };
  } catch { return { statusCode: 502, body: '{"skins":[]}' }; }
};
