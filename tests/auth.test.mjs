import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

process.env.OSU_CLIENT_ID = '123'; process.env.OSU_CLIENT_SECRET = 'topsecret'; process.env.SITE_URL = 'https://site.test';
const auth = require('../netlify/functions/auth.js');
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
let n = 0;
const ev = (qs, cookie) => ({ httpMethod: 'GET', queryStringParameters: qs, headers: { cookie, 'x-nf-client-connection-ip': `172.20.0.${n++}` } });
const start = async () => { const r = await auth.handler(ev({})); return { r, state: new URL(r.headers.Location).searchParams.get('state') }; };

test('Login-Start leitet zu osu! mit state und unveränderter Callback-URL', async () => {
  const { r, state } = await start(); const loc = new URL(r.headers.Location);
  assert.equal(r.statusCode, 302); assert.equal(loc.host, 'osu.ppy.sh');
  assert.match(state, /^[0-9a-f]{48}$/);
  assert.equal(loc.searchParams.get('redirect_uri'), 'https://site.test/.netlify/functions/auth');
  assert.match(r.headers['Set-Cookie'], /HttpOnly; Secure; SameSite=Lax/);
});

test('Callback ohne passenden state wird abgelehnt (Login-CSRF)', async () => {
  const { state } = await start();
  assert.equal((await auth.handler(ev({ code: 'abc', state: 'f'.repeat(48) }, 'osu_st=' + state))).statusCode, 400);
  assert.equal((await auth.handler(ev({ code: 'abc' }))).statusCode, 400);
});

test('erfolgreicher Callback setzt HttpOnly-Cookie und räumt state auf', async () => {
  const { state } = await start();
  globalThis.fetch = async () => new Response(JSON.stringify({ access_token: 'TOKEN1234567890abcdef', expires_in: 86400 }), { status: 200 });
  const r = await auth.handler(ev({ code: 'abc', state }, 'osu_st=' + state));
  assert.equal(r.statusCode, 302);
  assert.match(r.multiValueHeaders['Set-Cookie'][0], /^osu_t=TOKEN1234567890abcdef; HttpOnly; Secure; SameSite=Lax; Path=\/; Max-Age=86400/);
  assert.match(r.multiValueHeaders['Set-Cookie'][1], /osu_st=; .*Max-Age=0/);
});

test('Fehlerseite verrät keine Interna', async () => {
  const { state } = await start();
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'invalid_grant', hint: 'GEHEIM', client_secret: 'topsecret' }), { status: 400 });
  const r = await auth.handler(ev({ code: 'abc', state }, 'osu_st=' + state));
  assert.equal(r.statusCode, 400); assert.doesNotMatch(r.body, /GEHEIM|topsecret|invalid_grant/);
});

test('Logout löscht das Cookie, Limiter bremst Missbrauch', async () => {
  const r = await auth.handler(ev({ logout: '1' })); assert.match(r.headers['Set-Cookie'], /osu_t=; .*Max-Age=0/);
  const same = { httpMethod: 'GET', queryStringParameters: {}, headers: { 'x-nf-client-connection-ip': '172.30.0.1' } };
  let last; for (let i = 0; i < 25; i++) last = await auth.handler(same);
  assert.equal(last.statusCode, 429);
});
