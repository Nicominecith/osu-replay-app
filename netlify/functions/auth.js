// Login (ohne ?code) -> osu!-OAuth, Callback (mit ?code) -> Token als HttpOnly-Cookie, ?logout=1 -> abmelden
// Die URL /.netlify/functions/auth muss gleich bleiben: sie ist als Callback in den osu!-App-Einstellungen hinterlegt.
const crypto = require('node:crypto');
const NOSTORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const COOKIE = 'HttpOnly; Secure; SameSite=Lax; Path=/';
const hits = new Map();
const limited = (ip, max, ms) => { const n = Date.now(); const a = (hits.get(ip) || []).filter(t => n - t < ms); a.push(n); hits.set(ip, a); if (hits.size > 3000) hits.clear(); return a.length > max; };
const err = (status, msg) => ({ statusCode: status, headers: { ...NOSTORE, 'Content-Type': 'text/plain; charset=utf-8' }, body: msg });
const getCookie = (e, name) => { const m = new RegExp('(?:^|;\\s*)' + name + '=([^;]+)').exec((e.headers && (e.headers.cookie || e.headers.Cookie)) || ''); return m ? m[1] : null; };

exports.handler = async (e) => {
  if (e.httpMethod && e.httpMethod !== 'GET') return err(405, 'Methode nicht erlaubt');
  const q = e.queryStringParameters || {};
  const ip = (e.headers && (e.headers['x-nf-client-connection-ip'] || (e.headers['x-forwarded-for'] || '').split(',')[0].trim())) || 'unknown';
  if (limited(ip, 20, 60000)) return { ...err(429, 'Zu viele Anfragen'), headers: { ...NOSTORE, 'Retry-After': '30', 'Content-Type': 'text/plain; charset=utf-8' } };
  const site = process.env.SITE_URL || process.env.URL;
  if (!site || !process.env.OSU_CLIENT_ID || !process.env.OSU_CLIENT_SECRET) { console.error('auth: Konfiguration unvollständig'); return err(500, 'Login ist gerade nicht verfügbar.'); }
  const redirect = `${site.replace(/\/$/, '')}/.netlify/functions/auth`;

  if (q.logout) return { statusCode: 302, headers: { ...NOSTORE, Location: '/', 'Set-Cookie': `osu_t=; ${COOKIE}; Max-Age=0` } };

  if (!q.code) { // Schritt 1: zu osu! weiterleiten, zufälligen state merken (Schutz vor Login-CSRF)
    const state = crypto.randomBytes(24).toString('hex');
    const u = new URL('https://osu.ppy.sh/oauth/authorize');
    u.search = new URLSearchParams({ client_id: process.env.OSU_CLIENT_ID, redirect_uri: redirect, response_type: 'code', scope: 'public identify', state });
    return { statusCode: 302, headers: { ...NOSTORE, Location: u.toString(), 'Set-Cookie': `osu_st=${state}; ${COOKIE}; Max-Age=600` } };
  }

  // Schritt 2: Callback prüfen
  const want = getCookie(e, 'osu_st'), got = typeof q.state === 'string' ? q.state : '';
  const clearSt = `osu_st=; ${COOKIE}; Max-Age=0`;
  const a = Buffer.from(want || ''), b = Buffer.from(got);
  if (!/^[0-9a-f]{48}$/.test(want || '') || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ...err(400, 'Login fehlgeschlagen. Bitte starte die Anmeldung erneut.'), headers: { ...NOSTORE, 'Content-Type': 'text/plain; charset=utf-8', 'Set-Cookie': clearSt } };
  if (typeof q.code !== 'string' || q.code.length > 2048) return err(400, 'Login fehlgeschlagen. Bitte starte die Anmeldung erneut.');
  try {
    const r = await fetch('https://osu.ppy.sh/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: Number(process.env.OSU_CLIENT_ID), client_secret: process.env.OSU_CLIENT_SECRET, code: q.code, grant_type: 'authorization_code', redirect_uri: redirect }),
      signal: AbortSignal.timeout(10000)
    });
    const t = await r.json().catch(() => ({}));
    if (!r.ok || typeof t.access_token !== 'string' || !/^[A-Za-z0-9._~+/=-]{10,4096}$/.test(t.access_token)) { console.error('auth: Token-Tausch fehlgeschlagen, Status', r.status); return { ...err(400, 'Login fehlgeschlagen. Bitte versuche es erneut.'), headers: { ...NOSTORE, 'Content-Type': 'text/plain; charset=utf-8', 'Set-Cookie': clearSt } }; }
    const age = Math.max(60, Math.min(+t.expires_in || 3600, 86400));
    return { statusCode: 302, headers: { ...NOSTORE, Location: '/' }, multiValueHeaders: { 'Set-Cookie': [`osu_t=${t.access_token}; ${COOKIE}; Max-Age=${age}`, clearSt] } };
  } catch (x) { console.error('auth: Fehler', x && x.name); return err(502, 'Login ist gerade nicht erreichbar.'); }
};
