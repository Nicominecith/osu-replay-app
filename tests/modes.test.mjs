import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const core = require('../public/modes.js');
const idx = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const cut = (a, b) => idx.slice(idx.indexOf(a), idx.indexOf(b));
const src = cut('const MODBIT', '/* ---------- Player ---------- */') + cut('const bez =', 'function prep(');
const H = new Function(src + '; return { parseMap, buildPath, posAt, slideFrac };')();
const hdr = (cs, od, extra = '') => `osu file format v14\n[General]\nAudioFilename: a.mp3\n[Difficulty]\nHPDrainRate:5\nCircleSize:${cs}\nOverallDifficulty:${od}\nApproachRate:8\nSliderMultiplier:1.4\nSliderTickRate:1\n[TimingPoints]\n0,500,4,1,0,100,1,0\n[HitObjects]\n${extra}`;
const mi = { bits: 0, speed: 1, tc: false };
const fr = a => a.map(([t, x, y = 0, k = 0]) => ({ t, x, y, k }));

test('Taiko: Great, Ok, falsche Farbe = Miss, Roll/Swell ohne Wertung', () => {
  const txt = hdr(5, 5, '256,192,1000,1,0\n256,192,1500,1,2\n256,192,2000,1,0\n256,192,2500,2,0,L|356:192,1,100\n');
  const F = fr([[0, 0], [1000, 0, 0, 1], [1100, 0, 0, 0], [1560, 0, 0, 2], [1700, 0, 0, 0], [2000, 0, 0, 2], [2100, 0, 0, 0], [2600, 0, 0, 1], [2700, 0, 0, 0]]);
  const m = core.build(1, txt, F, mi, H);
  assert.equal(m.mode, 1); assert.equal(m.ho.length, 4);
  assert.deepEqual(m.ho.slice(0, 3).map(o => o.res), [3, 2, 0]);
  assert.equal(m.ho[3].k, 'roll'); assert.equal(m.ho[3].res, undefined);
  assert.equal(m.stats.n3, 1); assert.equal(m.stats.n1, 1); assert.equal(m.stats.miss, 1);
  assert.ok(m.ev.length === 3 && m.ev.at(-1).a < 1);
});
test('Taiko: nicht getroffene Noten sind Miss', () => {
  const m = core.build(1, hdr(5, 5, '256,192,1000,1,0\n256,192,1500,1,0\n'), fr([[0, 0], [5000, 0]]), mi, H);
  assert.deepEqual(m.ho.map(o => o.res), [0, 0]); assert.equal(m.stats.mx, 0);
});
test('Mania 4K: Spalten, Hold, Genauigkeit', () => {
  const txt = hdr(4, 8, '64,192,1000,1,0\n192,192,1000,1,0\n320,192,1500,128,0,2000:0:0:0:0:\n448,192,2500,1,0\n');
  const F = fr([[0, 0], [1000, 3], [1050, 0], [1500, 4], [2000, 0], [2600, 8], [2700, 0]]);
  const m = core.build(3, txt, F, mi, H);
  assert.equal(m.keys, 4); assert.deepEqual(m.ho.map(o => o.col), [0, 1, 2, 3]);
  assert.equal(m.ho[0].res, 3); assert.equal(m.ho[2].k, 'hold'); assert.equal(m.ho[2].end, 2000);
  assert.equal(m.ho[2].res, 3); assert.equal(m.ho[2].tres, 3);
  assert.ok(m.ho[3].res >= 1 && m.ho[3].res <= 2);
  assert.ok(m.stats.n3 >= 4 && m.stats.miss === 0);
  assert.ok(m.ev.at(-1).a > .8 && m.ev.at(-1).a <= 1);
});
test('Mania: verpasste Noten und zu frühes Loslassen', () => {
  const txt = hdr(4, 8, '64,192,1000,1,0\n320,192,1500,128,0,2500:0:0:0:0:\n');
  const m = core.build(3, txt, fr([[0, 0], [1500, 4], [1600, 0]]), mi, H);
  assert.equal(m.ho[0].res, 0); assert.equal(m.ho[1].res, 3); assert.equal(m.ho[1].tres, 0);
  assert.equal(m.stats.miss, 2);
});
test('Catch: Früchte, Slider-Tropfen, gefangen/verpasst', () => {
  const txt = hdr(4, 5, '100,100,1000,1,0\n400,100,1500,1,0\n256,100,2000,2,0,L|356:100,1,200\n');
  const F = fr([[0, 100], [1200, 100], [1300, 400], [1900, 400], [2000, 256], [2100, 256], [4000, 256]]);
  const m = core.build(2, txt, F, mi, H);
  assert.equal(m.mode, 2); assert.ok(m.ho.length >= 4 && m.pre > 0);
  assert.equal(m.ho[0].res, 3); assert.equal(m.ho[1].res, 3);
  assert.ok(m.ho.some(o => o.k === 'drop'));
  assert.ok(m.stats.n3 >= 2);
});
test('Replay-Tasten: Taiko-Presses nur bei neuer Flanke', () => {
  const P = core.taikoPresses(fr([[0, 0, 0, 1], [50, 0, 0, 1], [100, 0, 0, 3], [150, 0, 0, 0]]));
  assert.deepEqual(P.map(p => p.kind), ['don', 'kat']);
});
test('Einbindung: Skripte, Umschalter und Hooks vorhanden', () => {
  assert.match(idx, /<script src="\/modes\.js\?v=\d+"><\/script>/);
  for (const k of ['xmDraw', 'xmBuild', 'xmApi']) assert.ok(idx.includes(k), k);
  assert.ok(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8').includes('/modes.js'));
});
