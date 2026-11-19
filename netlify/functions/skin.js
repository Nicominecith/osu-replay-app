// Lädt eine Skin-Datei (.osk/.zip) serverseitig nach (CORS-Umgehung, max. ~4,5 MB wegen Netlify-Limit)
exports.handler = async (e) => {
  if (!/osu_t=/.test(e.headers.cookie || '')) return { statusCode: 401, body: 'nicht eingeloggt' };
  let u; try { u = new URL((e.queryStringParameters || {}).u || ''); } catch { return { statusCode: 400, body: 'ungültige URL' }; }
  if (u.protocol !== 'https:' || /^(localhost|\[|\d+\.\d+\.\d+\.\d+$)/i.test(u.hostname) || !u.hostname.includes('.')) return { statusCode: 400, body: 'URL nicht erlaubt' };
  try {
    const r = await fetch(u, { redirect: 'follow', signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { statusCode: 502, body: 'Quelle antwortet mit ' + r.status };
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4.5e6) return { statusCode: 413, body: 'Skin zu groß' };
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) return { statusCode: 415, body: 'keine Skin-Datei' };
    return { statusCode: 200, headers: { 'Content-Type': 'application/octet-stream' }, body: buf.toString('base64'), isBase64Encoded: true };
  } catch { return { statusCode: 502, body: 'Download fehlgeschlagen' }; }
};
