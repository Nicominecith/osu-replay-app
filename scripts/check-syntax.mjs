// Prüft ohne Abhängigkeiten, dass alle Inline-Skripte und JS-Dateien syntaktisch gültig sind.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';

let failed = 0;
const fail = (what, e) => { failed++; console.error(`FEHLER ${what}: ${e.message}`); };

const html = readFileSync('public/index.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
inline.forEach((code, i) => { try { new vm.Script(code, { filename: `index.html#script${i}` }); } catch (e) { fail(`index.html Inline-Skript ${i}`, e); } });
console.log(`index.html: ${inline.length} Inline-Skripte geprüft`);

const files = ['public/sw.js', 'public/extras.js', ...readdirSync('netlify/functions').map(f => 'netlify/functions/' + f), ...readdirSync('scripts').map(f => 'scripts/' + f), ...readdirSync('tests').map(f => 'tests/' + f)];
for (const f of files) { try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); } catch (e) { fail(f, new Error(String(e.stderr).split('\n')[0])); } }
console.log(`${files.length} Dateien mit node --check geprüft`);

if (/cdn\.jsdelivr|unpkg\.com/.test(html)) fail('index.html', new Error('Externe Skript-CDNs sind nicht erlaubt (Lieferkette). Bibliotheken gehören nach public/vendor/.'));
if (/\.netlify\/functions\/(api|beatmap|skins?)\b/.test(html)) fail('index.html', new Error('Alte Funktions-URLs gefunden. API läuft über /api/*.'));
process.exit(failed ? 1 : 0);
