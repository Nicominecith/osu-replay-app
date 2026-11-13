// Holt die .osu-Datei einer Beatmap (Umgehung von CORS)
exports.handler = async (e) => {
  const id = (e.queryStringParameters || {}).id;
  if (!/^\d+$/.test(id || '')) return { statusCode: 400, body: 'ungültige ID' };
  for (const u of [`https://osu.ppy.sh/osu/${id}`, `https://catboy.best/osu/${id}`]) {
    try {
      const r = await fetch(u);
      if (r.ok) return { statusCode: 200, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'public, max-age=86400' }, body: await r.text() };
    } catch {}
  }
  return { statusCode: 502, body: 'Beatmap nicht gefunden' };
};
