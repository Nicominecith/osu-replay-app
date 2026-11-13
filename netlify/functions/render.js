// Proxy zu o!rdr (rendert .osr zu mp4)
//   POST ?username=&o={json}  -> Render starten (Body = .osr)
//   GET  ?id=123              -> Status eines Renders
//   GET  ?skins=1&search=     -> Skin-Liste
const ORDR = 'https://apis.issou.best/ordr';
const J = { 'Content-Type': 'application/json' };
const T = { resolution: 's', globalVolume: 'n', musicVolume: 'n', hitsoundVolume: 'n', useSkinHitsounds: 'b', inGameBGDim: 'n', introBGDim: 'n', breakBGDim: 'n', cursorSize: 'n', cursorTrail: 'b', cursorRainbow: 'b', showBorders: 'b', loadStoryboard: 'b', loadVideo: 'b', showScore: 'b', showHPBar: 'b', showComboCounter: 'b', showPPCounter: 'b', showHitErrorMeter: 'b', showUnstableRate: 'b', showSliderBreaks: 'b', showMods: 'b', showScoreboard: 'b', showResultScreen: 'b' };
const RES = ['720x480', '960x540', '1280x720', '1920x1080'];
const out = (r, body) => ({ statusCode: r.status, headers: J, body });
exports.handler = async (e) => {
  const q = e.queryStringParameters || {};
  if (!/osu_t=/.test(e.headers.cookie || '')) return { statusCode: 401, headers: J, body: '{"error":"nicht eingeloggt"}' };
  if (e.httpMethod === 'GET') {
    if (q.skins) { const r = await fetch(`${ORDR}/skins?pageSize=24&page=1&search=${encodeURIComponent(q.search || '')}`); return out(r, await r.text()); }
    if (!/^\d+$/.test(q.id || '')) return { statusCode: 400, headers: J, body: '{"error":"ungültige ID"}' };
    const r = await fetch(`${ORDR}/renders?renderID=${q.id}`);
    return out(r, await r.text());
  }
  const buf = Buffer.from(e.body || '', e.isBase64Encoded ? 'base64' : 'binary');
  if (buf.length < 100 || buf.length > 5e6) return { statusCode: 400, headers: J, body: '{"error":"Replay-Datei ungültig"}' };
  let o = {}; try { o = JSON.parse(q.o || '{}'); } catch {}
  const f = new FormData();
  f.append('replayFile', new Blob([buf]), 'replay.osr');
  f.append('username', (q.username || 'osu-replay-app').slice(0, 25));
  for (const [k, t] of Object.entries(T)) {
    const v = o[k]; if (v === undefined || v === null) continue;
    if (k === 'resolution' ? !RES.includes(v) : t === 'n' ? typeof v !== 'number' : t === 'b' ? typeof v !== 'boolean' : false) continue;
    f.append(k, String(v));
  }
  if (!f.has('resolution')) f.append('resolution', '1280x720');
  // Skin: gewählter Skin, sonst der meistgenutzte aus der o!rdr-Liste
  let skin = typeof o.skin === 'string' ? o.skin : '';
  if (!skin) {
    try {
      const j = await (await fetch(`${ORDR}/skins?pageSize=100&page=1`)).json();
      skin = ((j.skins || []).sort((a, b) => (b.timesUsed || 0) - (a.timesUsed || 0))[0] || {}).skin || '';
    } catch {}
  }
  f.append('skin', skin || process.env.ORDR_SKIN || 'default');
  f.append('customSkin', 'false');
  if (process.env.ORDR_KEY) f.append('verificationKey', process.env.ORDR_KEY);
  const r = await fetch(`${ORDR}/renders`, { method: 'POST', body: f });
  return out(r, await r.text());
};
