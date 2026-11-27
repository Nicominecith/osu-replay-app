import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { peekStream } from '../netlify/functions/gateway.mjs';

const readAll = async s => { const r = s.getReader(), out = []; for (;;) { const { done, value } = await r.read(); if (done) break; out.push(Buffer.from(value)); } return Buffer.concat(out); };

test('ZIP wird komplett durchgereicht (auch über mehrere Blöcke)', async () => {
  const src = new PassThrough(), p = peekStream(src, 1e6);
  src.write(Buffer.from([0x50, 0x4b, 3, 4, 1])); src.write(Buffer.alloc(1000, 7)); src.end(Buffer.alloc(500, 9));
  assert.equal((await readAll(await p)).length, 5 + 1000 + 500);
});
test('Nicht-ZIP wird abgelehnt', async () => {
  const src = new PassThrough(), p = peekStream(src, 1e6); src.write(Buffer.from('<html>nope')); await assert.rejects(p, /notzip/);
});
test('Größenlimit greift mitten im Download', async () => {
  const src = new PassThrough(), p = peekStream(src, 100); src.write(Buffer.from([0x50, 0x4b, 3, 4])); const s = await p;
  src.write(Buffer.alloc(200)); await assert.rejects(readAll(s), /size/);
});
