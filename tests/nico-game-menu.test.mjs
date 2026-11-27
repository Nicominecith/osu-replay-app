import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const rd = f => readFileSync(new URL('../public/nicominecith/' + f, import.meta.url), 'utf8');
const core = rd('assets/index-D-irMmMR.js'), lazy = rd('assets/lazy-B3G4QhUC.js'), page = rd('index.html');

test('Schwebendes Bedienfeld ist entfernt', () => {
  assert.ok(!/host-bridge/.test(page));
  assert.ok(!existsSync(new URL('../public/nicominecith/host-bridge.js', import.meta.url)));
  assert.ok(!existsSync(new URL('../public/nicominecith/host-bridge.css', import.meta.url)));
});

test('zwei neue Menüeinträge: Account-Import und Spiel schließen', () => {
  assert.ok(lazy.includes('Maps aus deinem osu!-Konto importieren') && lazy.includes('e.importAccount()'));
  assert.ok(lazy.includes('Spiel schließen') && lazy.includes('e.closeGame()'));
});

test('Spiel hat importAccount, closeGame und eingebundenen Datei-Dialog', () => {
  assert.ok(core.includes('async importAccount()') && core.includes('closeGame()') && core.includes('nicoHost()'));
  assert.ok(core.includes('document.body.appendChild(t)'), 'Eingabefeld muss im DOM sein (Android)');
  assert.ok(core.includes('(osz|osk|zip)$/i'));
});

test('Exit im Hauptmenü schließt das eingebettete Spiel', () => {
  assert.ok(core.includes('this.game.closeGame()||this.exit()'));
});
