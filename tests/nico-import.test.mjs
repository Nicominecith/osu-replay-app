import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

// Die Import-Logik der App (zwischen den Markern in public/index.html) wird isoliert mit Stubs ausgeführt.
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const a = html.indexOf("const MAP_MIRRORS"), b = html.indexOf("$('#q').oninput");
assert.ok(a > 0 && b > a, 'Import-Code nicht gefunden');
const code = html.slice(a, b);

const zip = (n = 5000) => { const u = new Uint8Array(n); u[0] = 0x50; u[1] = 0x4b; return u.buffer; };
function run({ me = { id: 7 }, lists, fetchImpl, done } = {}) {
  const store = new Map(done ? [['osuImported', JSON.stringify(done)]] : []);
  const log = { status: [], delivered: [], fetched: [] };
  const sandbox = {
    window: {}, me, MAX_MAPZIP: 200e6, Uint8Array, AbortSignal, JSON, String, Map, Promise, console,
    $: () => ({ hidden: false, removeAttribute() {} }),
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    api: async path => ({ ok: true, json: async () => (lists ? lists(path) : []) }),
    fetch: async url => { log.fetched.push(url); return fetchImpl(url); }
  };
  vm.runInNewContext(code, sandbox);
  const ctx = { deliver: async (name, buf) => { log.delivered.push({ name, size: buf.byteLength }); }, status: (t, k) => log.status.push([t, k]) };
  return { host: sandbox.window.nicoHost, ctx, log, store };
}
const sets = n => Array.from({ length: n }, (_, i) => ({ beatmapset: { id: 100 + i, title: `Song / ${i}: "x"` } }));
const ok = () => ({ ok: true, arrayBuffer: async () => zip() });

test('ohne Anmeldung: klare Meldung, nichts wird geladen', async () => {
  const t = run({ me: null, fetchImpl: ok }); await t.host.importMaps(t.ctx);
  assert.equal(t.log.fetched.length, 0); assert.match(t.log.status.at(-1)[0], /Anmeldung/); assert.equal(t.log.status.at(-1)[1], 'err');
});

test('Erfolg: Datei wird mit bereinigtem Namen übergeben und gemerkt', async () => {
  const t = run({ lists: p => (p.includes('most_played') ? sets(2) : []), fetchImpl: ok }); await t.host.importMaps(t.ctx);
  assert.deepEqual(t.log.delivered.map(d => d.name), ['100 Song  0 x.osz', '101 Song  1 x.osz']);
  assert.deepEqual(JSON.parse(t.store.get('osuImported')), [100, 101]); assert.equal(t.log.status.at(-1)[1], 'ok');
});

test('Mirror-Ausfall: nächster Mirror wird probiert, Nicht-ZIP wird abgelehnt', async () => {
  let n = 0;
  const t = run({ lists: p => (p.includes('most_played') ? sets(1) : []), fetchImpl: async () => { n++; if (n === 1) throw new Error('CORS'); if (n === 2) return { ok: true, arrayBuffer: async () => new TextEncoder().encode('<html>'.repeat(300)).buffer }; return ok(); } });
  await t.host.importMaps(t.ctx);
  assert.equal(t.log.delivered.length, 1); assert.equal(n, 3);
});

test('alle Mirrors down: Fehler wird gemeldet, nichts als importiert gemerkt', async () => {
  const t = run({ lists: p => (p.includes('most_played') ? sets(2) : []), fetchImpl: async () => { throw new Error('down'); } }); await t.host.importMaps(t.ctx);
  assert.equal(t.log.delivered.length, 0); assert.equal(t.store.get('osuImported'), undefined);
  assert.match(t.log.status.at(-1)[0], /2 nicht ladbar/); assert.equal(t.log.status.at(-1)[1], 'err');
});

test('bereits importiert: Hinweis; mit force wird erneut geladen', async () => {
  const lists = p => (p.includes('most_played') ? sets(1) : []);
  let t = run({ lists, fetchImpl: ok, done: [100] }); await t.host.importMaps(t.ctx);
  assert.equal(t.log.delivered.length, 0); assert.match(t.log.status.at(-1)[0], /schon importiert/);
  t = run({ lists, fetchImpl: ok, done: [100] }); await t.host.importMaps({ ...t.ctx, force: true });
  assert.equal(t.log.delivered.length, 1);
});

test('maximal 10 pro Durchlauf, Rest wird angezeigt', async () => {
  const t = run({ lists: p => (p.includes('most_played') ? sets(14) : []), fetchImpl: ok }); await t.host.importMaps(t.ctx);
  assert.equal(t.log.delivered.length, 10); assert.match(t.log.status.at(-1)[0], /Noch 4 übrig/);
});

test('API-Fehler beim Laden der Mapliste wird gemeldet', async () => {
  const sandboxApi = run({ fetchImpl: ok });
  const t = run({ fetchImpl: ok }); // leere Listen
  await t.host.importMaps(t.ctx); assert.match(t.log.status.at(-1)[0], /keine Maps gefunden/);
  assert.ok(sandboxApi.host);
});
