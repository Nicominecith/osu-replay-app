// Sammel-Endpunkt für alle API-Routen unter /api/*  (eine Netlify-Rate-Limit-Regel deckt alles ab)
//   /api/osu      -> osu!-API v2 (Token bleibt im HttpOnly-Cookie, nur freigegebene Pfade + Parameter)
//   /api/beatmap  -> .osu-Datei einer Beatmap
//   /api/skins    -> Skin-Liste (o!rdr), nur eingeloggt
//   /api/skin     -> Skin-Datei laden (SSRF-geschützt), nur eingeloggt
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';
import crypto from 'node:crypto';

export const config = {
  path: '/api/*',
  // Netlify-Limit pro IP (greift am Edge, bevor die Funktion läuft). Free-Pläne erlauben 2 Regeln pro Projekt.
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] }
};

const OSU = 'https://osu.ppy.sh';
const BASE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin'
};
const json = (status, obj, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', ...extra } });
const fail = (status, msg) => json(status, { error: msg });

/* ---------- einfacher Zusatz-Limiter pro Funktions-Instanz (zweite Schicht, best effort) ---------- */
const hits = new Map();
function limited(key, max, windowMs) {
  const now = Date.now(); let a = hits.get(key);
  if (!a) { a = []; hits.set(key, a); }
  while (a.length && now - a[0] > windowMs) a.shift();
  if (a.length >= max) return true;
  a.push(now);
  if (hits.size > 5000) for (const [k, v] of hits) { if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k); if (hits.size <= 2500) break; }
  return false;
}
const clientIp = (req, ctx) => (ctx && ctx.ip) || req.headers.get('x-nf-client-connection-ip') || (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
const ROUTE_LIMITS = { osu: [90, 6e4], beatmap: [40, 6e4], skins: [30, 6e4], skin: [12, 6e4] };

/* ---------- Login prüfen: Token muss bei osu! tatsächlich gültig sein (nicht nur ein Cookie mit beliebigem Wert) ---------- */
const TOKEN_RE = /^[A-Za-z0-9._~+/=-]{10,4096}$/;
function getToken(req) {
  const m = /(?:^|;\s*)osu_t=([^;]+)/.exec(req.headers.get('cookie') || '');
  if (!m) return null;
  let t; try { t = decodeURIComponent(m[1]); } catch { return null; }
  return TOKEN_RE.test(t) ? t : null;
}
const okTokens = new Map(); // sha256(token) -> Ablaufzeit
async function validLogin(token) {
  const h = crypto.createHash('sha256').update(token).digest('hex'), now = Date.now();
  const exp = okTokens.get(h); if (exp && exp > now) return true;
  try {
    const r = await fetch(OSU + '/api/v2/me/osu', { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'x-api-version': '20220705' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return false;
    if (okTokens.size > 2000) okTokens.clear();
    okTokens.set(h, now + 5 * 60 * 1000);
    return true;
  } catch { return false; }
}

/* ---------- Eingabe-Prüfung ---------- */
const int = (v, min, max, def) => { if (v == null || v === '') return def; if (!/^\d{1,9}$/.test(String(v))) return NaN; const n = +v; return n < min || n > max ? NaN : n; };
const MODES = new Set(['osu', 'taiko', 'fruits', 'mania']);
// Erlaubte osu!-Pfade + exakt erlaubte Parameter je Pfad
const OSU_ROUTES = [
  { re: /^\/me\/osu$/, params: {} },
  { re: /^\/search$/, params: { mode: v => (v === 'user' ? v : null), query: v => (typeof v === 'string' && v.length >= 1 && v.length <= 60 ? v : null), page: v => { const n = int(v, 1, 20); return Number.isNaN(n) ? null : String(n); } } },
  { re: /^\/users\/\d{1,10}\/beatmaps\/most_played$/, params: { limit: v => lim(v, 50), offset: v => off(v) } },
  { re: /^\/users\/\d{1,10}\/scores\/(recent|best)$/, params: { mode: v => (MODES.has(v) ? v : null), limit: v => lim(v, 100), offset: v => off(v), include_fails: v => (v === '0' || v === '1' ? v : null) } },
  { re: /^\/scores\/([a-z]{3,8}\/)?\d{1,12}\/download$/, params: {} }
];
const lim = (v, max) => { const n = int(v, 1, max); return Number.isNaN(n) || n == null ? null : String(n); };
const off = v => { const n = int(v, 0, 1000); return Number.isNaN(n) || n == null ? null : String(n); };

async function routeOsu(req, token) {
  const q = new URL(req.url).searchParams, path = q.get('path') || '';
  const rule = OSU_ROUTES.find(r => r.re.test(path));
  if (!rule) return fail(400, 'Pfad nicht erlaubt');
  const out = new URLSearchParams();
  for (const [k, v] of q) {
    if (k === 'path') continue;
    const f = rule.params[k]; const val = f ? f(v) : null;
    if (val == null) return fail(400, 'Ungültiger Parameter');
    out.set(k, val);
  }
  const qs = out.toString();
  let r;
  try {
    r = await fetch(OSU + '/api/v2' + path + (qs ? '?' + qs : ''), { headers: { Authorization: 'Bearer ' + token, 'x-api-version': '20220705', Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  } catch { return fail(502, 'osu! nicht erreichbar'); }
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 12e6) return fail(502, 'Antwort zu groß');
  if (!r.ok) return fail(r.status === 401 || r.status === 403 || r.status === 404 || r.status === 429 ? r.status : 502, 'osu!-Anfrage fehlgeschlagen');
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  const type = ct.startsWith('application/json') ? 'application/json; charset=utf-8' : 'application/octet-stream';
  return new Response(buf, { status: 200, headers: { ...BASE_HEADERS, 'Content-Type': type } });
}

async function routeBeatmap(req) {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^\d{1,10}$/.test(id)) return fail(400, 'Ungültige ID');
  for (const u of [`${OSU}/osu/${id}`, `https://catboy.best/osu/${id}`]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > 8e6) continue;
      return new Response(buf, { status: 200, headers: { ...BASE_HEADERS, 'Cache-Control': 'public, max-age=86400', 'Content-Type': 'text/plain; charset=utf-8' } });
    } catch {}
  }
  return fail(502, 'Beatmap nicht gefunden');
}

async function routeSkins(req) {
  const q = new URL(req.url).searchParams;
  const size = int(q.get('size'), 1, 50, 50), page = int(q.get('page'), 1, 20, 1), search = q.get('search') || '';
  if (Number.isNaN(size) || Number.isNaN(page) || search.length > 60) return fail(400, 'Ungültige Parameter');
  try {
    const r = await fetch(`https://apis.issou.best/ordr/skins?pageSize=${size}&page=${page}&search=${encodeURIComponent(search)}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return json(502, { skins: [] });
    const text = await r.text();
    if (text.length > 3e6) return json(502, { skins: [] });
    JSON.parse(text); // nur gültiges JSON durchreichen
    return new Response(text, { status: 200, headers: { ...BASE_HEADERS, 'Cache-Control': 'private, max-age=900', 'Content-Type': 'application/json; charset=utf-8' } });
  } catch { return json(502, { skins: [] }); }
}

/* ---------- SSRF-sicherer Download (für /api/skin) ---------- */
export function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s); if (m) return isPrivateIp(m[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) return true;
    return s === '::' || s === '::1' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2001:db8') || s.startsWith('2002:');
  }
  return true;
}
// DNS-Auflösung wird beim Verbindungsaufbau geprüft -> kein "DNS-Rebinding"
function safeLookup(hostname, opts, cb) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err);
    if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) return cb(new Error('blocked'));
    if (opts && opts.all) return cb(null, addrs);
    cb(null, addrs[0].address, addrs[0].family);
  });
}
function safeGet(urlStr, maxBytes, hops = 3) {
  return new Promise((resolve, reject) => {
    let u; try { u = new URL(urlStr); } catch { return reject(new Error('url')); }
    if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !u.hostname.includes('.') || net.isIP(u.hostname.replace(/^\[|\]$/g, '')) || /^localhost$|\.(local|internal|localhost)$/i.test(u.hostname)) return reject(new Error('url'));
    const req = https.get(u, { lookup: safeLookup, timeout: 8000, headers: { 'User-Agent': 'osu-replay-skin-proxy', Accept: '*/*' } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (hops <= 0) return reject(new Error('redirects'));
        let next; try { next = new URL(res.headers.location, u).toString(); } catch { return reject(new Error('url')); }
        return safeGet(next, maxBytes, hops - 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('status')); }
      if (+res.headers['content-length'] > maxBytes) { res.destroy(); return reject(new Error('size')); }
      const chunks = []; let n = 0;
      res.on('data', c => { n += c.length; if (n > maxBytes) { res.destroy(); reject(new Error('size')); } else chunks.push(c); });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}
async function routeSkin(req) {
  const u = new URL(req.url).searchParams.get('u') || '';
  if (u.length > 2000) return fail(400, 'URL nicht erlaubt');
  let buf;
  try { buf = await safeGet(u, 4.5e6); } catch (e) { return fail(e.message === 'size' ? 413 : e.message === 'url' || e.message === 'blocked' ? 400 : 502, 'Skin konnte nicht geladen werden'); }
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) return fail(415, 'Keine Skin-Datei');
  return new Response(buf, { status: 200, headers: { ...BASE_HEADERS, 'Cache-Control': 'private, max-age=86400', 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="skin.osk"' } });
}

export default async (req, context) => {
  try {
    if (req.method !== 'GET') return fail(405, 'Methode nicht erlaubt');
    const m = /^\/api\/(osu|beatmap|skins|skin)\/?$/.exec(new URL(req.url).pathname);
    if (!m) return fail(404, 'Nicht gefunden');
    const route = m[1], [max, win] = ROUTE_LIMITS[route];
    if (limited(clientIp(req, context) + '|' + route, max, win)) return json(429, { error: 'Zu viele Anfragen' }, { 'Retry-After': '30' });
    if (route === 'beatmap') return await routeBeatmap(req);
    const token = getToken(req);
    if (!token) return fail(401, 'nicht eingeloggt');
    if (route === 'osu') return await routeOsu(req, token);
    if (!(await validLogin(token))) return fail(401, 'nicht eingeloggt');
    return route === 'skins' ? await routeSkins(req) : await routeSkin(req);
  } catch (e) {
    console.error('gateway error:', e && e.name); // keine Details/Inhalte loggen
    return fail(500, 'Interner Fehler');
  }
};
