import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import handler, { isPrivateIp, config } from '../netlify/functions/gateway.mjs';

const USER = 'osu_t=USERTOKEN1234567';
const realFetch = globalThis.fetch, realLookup = dns.lookup;
let calls;
process.env.OSU_CLIENT_ID = '1'; process.env.OSU_CLIENT_SECRET = 'secret';

beforeEach(() => {
  calls = [];
  globalThis.fetch = async (url, opt = {}) => {
    url = String(url); calls.push({ url, auth: opt.headers && opt.headers.Authorization });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
    if (url.endsWith('/oauth/token')) return json({ access_token: 'APPTOKEN1234567890', expires_in: 86400 });
    if (url.includes('/api/v2/')) {
      const bad = opt.headers.Authorization === 'Bearer EXPIREDTOKEN12345' || opt.headers.Authorization === 'Bearer FAKEFAKEFAKE1234';
      if (bad) return json({ error: 'expired' }, 401);
      return url.includes('/download') ? new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'application/x-osu-replay' } }) : json({ ok: 1 });
    }
    if (url.includes('apis.issou.best')) return new Response('{"skins":[]}', { status: 200 });
    if (url.includes('/osu/123')) return new Response('osu file format v14', { status: 200 });
    return new Response('nf', { status: 404 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; dns.lookup = realLookup; });

let n = 0;
const ip = () => `10.99.${(n >> 8) & 255}.${n++ & 255}`;
const GET = (path, cookie, addr = ip()) => handler(new Request('https://x.test' + path, { headers: cookie ? { cookie } : {} }), { ip: addr });

test('Rate-Limit-Konfiguration ist gesetzt', () => {
  assert.equal(config.path, '/api/*');
  assert.ok(config.rateLimit.windowLimit > 0 && config.rateLimit.windowSize > 0);
});

test('nur GET, unbekannte Routen und Default-Function-URL werden abgelehnt', async () => {
  assert.equal((await handler(new Request('https://x.test/api/osu', { method: 'POST' }), { ip: ip() })).status, 405);
  assert.equal((await GET('/api/foo')).status, 404);
  assert.equal((await GET('/.netlify/functions/gateway')).status, 404);
});

test('Antworten tragen Sicherheits-Header und enthalten keine Interna', async () => {
  const r = await GET('/api/osu?path=/me/osu', USER);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.match(r.headers.get('cache-control'), /no-store/);
  assert.doesNotMatch(await r.text(), /\bat \w+.*\(|node_modules|stack/i);
});

test('Eingabeprüfung /api/osu', async () => {
  const bad = ['/api/osu?path=/users/1/friends', '/api/osu?path=/me/osu/../../oauth/token', '/api/osu?path=/me/osu&evil=1',
    '/api/osu?path=/users/5/scores/best&mode=osu&limit=9999', '/api/osu?path=/users/5/scores/best&mode=evil',
    '/api/osu?path=/search&mode=user&query=' + 'a'.repeat(61), '/api/osu?path=/users/5/scores/recent&offset=-1'];
  for (const u of bad) assert.equal((await GET(u, USER)).status, 400, u);
  for (const u of ['/api/osu?path=/me/osu', '/api/osu?path=/users/5/scores/recent&mode=osu&limit=30&offset=0&include_fails=1', '/api/osu?path=/search&mode=user&query=peppy', '/api/osu?path=/scores/12345/download', '/api/osu?path=/scores/osu/12345/download'])
    assert.equal((await GET(u, USER)).status, 200, u);
});

test('Gastmodus: öffentliche Routen gehen ohne Login über App-Token', async () => {
  for (const u of ['/api/osu?path=/search&mode=user&query=peppy', '/api/osu?path=/users/5/scores/best&mode=osu&limit=10', '/api/osu?path=/users/5/beatmaps/most_played&limit=10']) {
    const r = await GET(u); assert.equal(r.status, 200, u);
  }
  assert.ok(calls.some(c => c.auth === 'Bearer APPTOKEN1234567890'), 'App-Token wurde benutzt');
  assert.ok(!calls.some(c => /USERTOKEN/.test(String(c.auth))));
});

test('Gastmodus: /me/osu und Replay-Download brauchen Login', async () => {
  for (const u of ['/api/osu?path=/me/osu', '/api/osu?path=/scores/12345/download', '/api/osu?path=/scores/osu/12345/download']) {
    const r = await GET(u); assert.equal(r.status, 401, u); assert.match(await r.text(), /login_required/);
  }
});

test('Abgelaufener Login fällt bei öffentlichen Routen auf Gast zurück, bei /me/osu nicht', async () => {
  assert.equal((await GET('/api/osu?path=/search&mode=user&query=peppy', 'osu_t=EXPIREDTOKEN12345')).status, 200);
  assert.equal((await GET('/api/osu?path=/me/osu', 'osu_t=EXPIREDTOKEN12345')).status, 401);
});

test('Gast-Limiter greift pro IP', async () => {
  const a = ip(); let last;
  for (let i = 0; i < 45; i++) last = await GET('/api/osu?path=/search&mode=user&query=x', null, a);
  assert.equal(last.status, 429);
  assert.equal((await GET('/api/osu?path=/search&mode=user&query=x', null, ip())).status, 200, 'andere IP bleibt unberührt');
});

test('Skin-Routen verlangen echten Login', async () => {
  assert.equal((await GET('/api/skins?size=5')).status, 401);
  assert.equal((await GET('/api/skins?size=5', 'osu_t=FAKEFAKEFAKE1234')).status, 401);
  assert.equal((await GET('/api/skin?u=https://example.com/a.osk')).status, 401);
  assert.equal((await GET('/api/skins?size=5&page=1', USER)).status, 200);
});

test('Beatmap-Route validiert die ID', async () => {
  assert.equal((await GET('/api/beatmap?id=abc')).status, 400);
  const r = await GET('/api/beatmap?id=123');
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /^text\/plain/);
});

test('SSRF: private Adressen werden erkannt', () => {
  for (const x of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.0.1', '172.16.5.5', '100.64.0.1', '0.0.0.0', '::1', 'fe80::1', 'fd00::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) assert.equal(isPrivateIp(x), true, x);
  for (const x of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111']) assert.equal(isPrivateIp(x), false, x);
});

test('SSRF: gefährliche Skin-URLs werden abgelehnt', async () => {
  for (const u of ['http://example.com/a.osk', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://localhost/a', 'https://169.254.169.254/latest/meta-data', 'https://example.com:8443/a', 'https://user:pw@example.com/a', 'file:///etc/passwd', 'https://metadata.google.internal/x', 'https://intranet.local/x', 'https://2130706433/a']) {
    const r = await GET('/api/skin?u=' + encodeURIComponent(u), USER); assert.ok([400, 502].includes(r.status), `${u} -> ${r.status}`);
  }
});

test('SSRF: Hostname, der auf eine interne IP auflöst, wird beim Verbindungsaufbau blockiert (DNS-Rebinding)', async () => {
  dns.lookup = (host, opts, cb) => cb(null, [{ address: '127.0.0.1', family: 4 }]);
  const r = await GET('/api/skin?u=' + encodeURIComponent('https://evil.example.com/a.osk'), USER);
  assert.ok([400, 502].includes(r.status));
});
