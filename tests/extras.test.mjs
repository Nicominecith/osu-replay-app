import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const idx = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const ex = readFileSync(new URL('../public/extras.js', import.meta.url), 'utf8');

test('extras.js und extras.css sind eingebunden', () => {
  assert.match(idx, /<script src="\/extras\.js\?v=\d+"><\/script>/);
  assert.match(idx, /href="\/extras\.css\?v=\d+"/);
  assert.ok(existsSync(new URL('../public/extras.css', import.meta.url)));
});
test('Beispiel-Beatmap liegt bei und ist ein ZIP', () => {
  const b = readFileSync(new URL('../public/nicominecith/sample.osz', import.meta.url));
  assert.equal(b[0], 0x50); assert.equal(b[1], 0x4b);
});
test('Pflichtfunktionen sind vorhanden', () => {
  for (const k of ['quickImport', 'deliverToGame', 'screenshot', 'jumpMiss', 'drawUr', 'translate', 'netCheck', 'saveReplay']) assert.ok(ex.includes(k), k);
});
test('jede Leisten-Aktion hat eine Funktion', () => {
  const ids = [...ex.matchAll(/\['([a-z0-9]{2,3})', '[^']+', '/g)].map(m => m[1]);
  assert.ok(ids.length >= 15);
  const sh = ex.slice(ex.indexOf('const SHORT'), ex.indexOf('bar.addEventListener'));
  for (const id of ids) assert.ok(new RegExp('\\b' + id + ':').test(sh), 'Aktion fehlt: ' + id);
});
