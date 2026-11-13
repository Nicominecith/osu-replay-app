// Proxy zu o!rdr (rendert .osr zu mp4). POST = Render starten, GET ?id= = Status abfragen
const API = 'https://apis.issou.best/ordr/renders';
const J = { 'Content-Type': 'application/json' };
exports.handler = async (e) => {
  const q = e.queryStringParameters || {};
  if (!/osu_t=/.test(e.headers.cookie || '')) return { statusCode: 401, headers: J, body: '{"error":"nicht eingeloggt"}' };
  if (e.httpMethod === 'GET') {
    if (!/^\d+$/.test(q.id || '')) return { statusCode: 400, headers: J, body: '{"error":"ungültige ID"}' };
    const r = await fetch(`${API}?renderID=${q.id}`);
    return { statusCode: r.status, headers: J, body: await r.text() };
  }
  const buf = Buffer.from(e.body || '', e.isBase64Encoded ? 'base64' : 'binary');
  if (buf.length < 100 || buf.length > 5e6) return { statusCode: 400, headers: J, body: '{"error":"Replay-Datei ungültig"}' };
  const f = new FormData();
  f.append('replayFile', new Blob([buf]), 'replay.osr');
  f.append('username', (q.username || 'osu-replay-app').slice(0, 25));
  f.append('resolution', '1280x720');
  if (process.env.ORDR_KEY) f.append('verificationKey', process.env.ORDR_KEY);
  const r = await fetch(API, { method: 'POST', body: f });
  return { statusCode: r.status, headers: J, body: await r.text() };
};
