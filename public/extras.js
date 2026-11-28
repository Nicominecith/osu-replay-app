/* Osu Replay – Zusatzfunktionen. Wird nach dem Hauptskript geladen und nutzt dessen globale Variablen
   (t, playing, M, F, rate, end, audio, S, me, curScore, osrBuf, $, esc, openReplay, openLocalReplay …). */
(() => {
  'use strict';
  const VER = '0.64', MODES = ['osu!standard', 'osu!taiko', 'osu!catch', 'osu!mania'];
  const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }, del: k => { try { localStorage.removeItem(k); } catch {} } };
  const firstRun = !ls.get('osuLang');
  let lang = ls.get('osuLang') || 'en';
  const T = (d, e) => lang === 'en' ? e : d;
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)];
  const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (html) e.innerHTML = html; return e; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const setTxt = (n, v) => { if (n && n.textContent !== v) n.textContent = v; };
  const fmt = ms => { const s = Math.max(0, ms / 1000 | 0); return `${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`; };
  const download = (blob, name) => { const a = el('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); };
  const clean = s => String(s || 'replay').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 80) || 'replay';

  /* ---------- Diagnose-Log (86) ---------- */
  const LOG = []; const logAdd = (k, a) => { LOG.push(`${new Date().toLocaleTimeString()} [${k}] ${a.map(x => x && x.stack ? x.stack.split('\n')[0] : typeof x === 'object' ? (() => { try { return JSON.stringify(x).slice(0, 200); } catch { return '?'; } })() : String(x)).join(' ').slice(0, 300)}`); if (LOG.length > 120) LOG.shift(); };
  for (const k of ['error', 'warn']) { const o = console[k].bind(console); console[k] = (...a) => { logAdd(k, a); o(...a); }; }
  addEventListener('error', e => logAdd('error', [e.message]));
  addEventListener('unhandledrejection', e => logAdd('promise', [e.reason && e.reason.message || e.reason]));

  /* ---------- Toasts (92) ---------- */
  const tbox = el('div', { id: 'xToast', role: 'status', 'aria-live': 'polite' });
  const toast = (m, err) => { const d = el('div', err ? { class: 'err' } : {}); d.textContent = m; tbox.append(d); setTimeout(() => d.remove(), err ? 5200 : 3200); };

  /* ---------- Gespeicherte Replays (7, 11, 75, 89) ---------- */
  const DB = () => new Promise((ok, no) => { const r = indexedDB.open('osuReplayDB', 1); r.onupgradeneeded = () => r.result.createObjectStore('r', { keyPath: 'key' }); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  const db = async (mode, fn) => { const d = await DB(); return new Promise((ok, no) => { const tx = d.transaction('r', mode), rq = fn(tx.objectStore('r')); tx.oncomplete = () => ok(rq && rq.result); tx.onerror = () => no(tx.error); }); };
  const repKey = () => (curScore && curScore.id || 0) + '|' + (curScore && curScore.beatmap && curScore.beatmap.id || 0) + '|' + (osrBuf ? osrBuf.byteLength : 0);
  const allReplays = async () => { try { return ((await db('readonly', s => s.getAll())) || []).sort((a, b) => b.ts - a.ts); } catch { return []; } };
  async function saveReplay() {
    try {
      if (!osrBuf || !M || !curScore) return;
      const meta = { ...curScore }; delete meta._osrBuf;
      const key = repKey();
      const old = ((await db('readonly', s => s.get(key))) || {});
      await db('readwrite', s => s.put({ key, ts: Date.now(), fav: !!old.fav, title: q('#title').textContent, meta, buf: osrBuf, size: osrBuf.byteLength }));
      const list = await allReplays(); let total = 0, n = 0;
      for (const r of list) { total += r.size; if (!r.fav && (++n > 12 || total > 60e6)) await db('readwrite', s => s.delete(r.key)); }
      X.cur = key;
    } catch (e) { console.warn('Replay speichern', e); }
  }
  const openSaved = async key => { const r = await db('readonly', s => s.get(key)); if (!r) return toast(T('Replay nicht gefunden', 'Replay not found'), 1); closeSheet(); await openReplay({ ...r.meta, _osrBuf: r.buf }); };
  const X = { cur: null, lastM: null, errs: [], misses: [], zoom: 1, mute: 0, stats: false, fps: false, mode: 0, rec: null, demo: false, zx: 50, zy: 50 };

  /* ---------- Spiel-Anbindung: .osz / Beispiel-Map (3, 10, 34) ---------- */
  const gameWin = () => { const f = q('#nicominecithIf'); return f && f.contentWindow; };
  async function gameReady() { for (let i = 0; i < 100; i++) { try { const w = gameWin(); if (w && w.document.querySelector('#app canvas')) { await sleep(1500); return w; } } catch {} await sleep(300); } return null; }
  async function deliverToGame(name, buf) {
    if (q('#nicominecithFrame').hidden || !q('#nicominecithIf').getAttribute('src')) q('#nicominecithBtn').click();
    const w = await gameReady(); if (!w) throw new Error('game');
    const file = new w.File([buf], name, { type: 'application/x-osu-beatmap-archive' }), dt = new w.DataTransfer(); dt.items.add(file);
    w.dispatchEvent(new w.DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    await sleep(1500);
  }
  q('#nicominecithIf') && q('#nicominecithIf').addEventListener('load', async () => {
    if (ls.get('osuSampleDone')) return;
    try { const w = await gameReady(); if (!w) return; const r = await fetch('/nicominecith/sample.osz'); if (!r.ok) return; await deliverToGame('Nicominecith - Tutorial Beat.osz', await r.arrayBuffer()); ls.set('osuSampleDone', '1'); } catch (e) { console.warn('Beispiel-Map', e); }
  });

  /* ---------- Schnell-Import per Link / ID (4, 49) ---------- */
  async function quickImport(txt) {
    txt = String(txt || '').trim(); if (!txt) return;
    let m;
    try {
      if ((m = /osu\.ppy\.sh\/scores\/(?:(osu|taiko|fruits|mania)\/)?(\d+)/i.exec(txt))) {
        toast(T('Lade Score…', 'Loading score…')); const r = await api('/scores/' + (m[1] ? m[1] + '/' : '') + m[2]);
        if (r.status === 401) return toast(T('Für Scores ist die osu!-Anmeldung nötig.', 'Scores need an osu! login.'), 1);
        if (!r.ok) return toast(T('Score nicht gefunden (' + r.status + ').', 'Score not found (' + r.status + ').'), 1);
        const s = await r.json(); if (!s.beatmap || !s.beatmapset) return toast(T('Score-Daten unvollständig.', 'Incomplete score data.'), 1);
        closeSheet(); return openReplay(s);
      }
      if (/^https?:\/\/\S+\.osr(\?\S*)?$/i.test(txt)) {
        toast(T('Lade Replay-Link…', 'Loading replay link…'));
        let b; try { b = await (await fetch(txt)).blob(); } catch { return toast(T('Der Server erlaubt keinen direkten Abruf. Lade die Datei herunter und zieh sie auf die Seite.', 'The server blocks direct access. Download the file and drop it on the page.'), 1); }
        closeSheet(); return openLocalReplay(new File([b], 'link.osr'));
      }
      if ((m = /beatmapsets\/(\d+)/i.exec(txt)) || /^\d{1,8}$/.test(txt)) {
        const id = m ? m[1] : txt; toast(T('Lade Beatmap-Set ' + id + '…', 'Loading beatmap set ' + id + '…')); const ab = await fetchMapZip(+id);
        if (!ab) return toast(T('Beatmap nicht von den Mirrors ladbar.', 'Beatmap not available from mirrors.'), 1);
        closeSheet(); await deliverToGame(id + '.osz', ab); return toast(T('Beatmap an das Spiel übergeben.', 'Beatmap sent to the game.'));
      }
      toast(T('Link nicht erkannt. Erlaubt: osu!-Score-Link, .osr-Link, Beatmap-Set-Link oder -ID.', 'Link not recognised. Use an osu! score link, .osr link, beatmap set link or ID.'), 1);
    } catch (e) { console.warn('quickImport', e); toast(T('Import fehlgeschlagen.', 'Import failed.'), 1); }
  }

  /* ---------- Drag & Drop auf der ganzen Seite (10, 42, 94) ---------- */
  const drop = el('div', { id: 'xDrop', hidden: '' });
  const dropTxt = () => { drop.innerHTML = `${T('Datei hier ablegen', 'Drop file here')}<small>.osr ${T('Replay', 'replay')} · .osz ${T('Beatmap für nicominecith osu!', 'beatmap for nicominecith osu!')} · .osk Skin</small>`; };
  let dragN = 0;
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  document.addEventListener('dragenter', e => { if (hasFiles(e)) { dragN++; dropTxt(); drop.hidden = false; } }, true);
  document.addEventListener('dragleave', e => { if (hasFiles(e) && --dragN <= 0) { dragN = 0; drop.hidden = true; } }, true);
  document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); }, true);
  document.addEventListener('drop', async e => {
    if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); dragN = 0; drop.hidden = true;
    for (const f of [...e.dataTransfer.files].slice(0, 10)) {
      try {
        if (/\.osr$/i.test(f.name)) await openLocalReplay(f);
        else if (/\.osz$/i.test(f.name)) { toast(T('Beatmap wird an das Spiel übergeben…', 'Sending beatmap to the game…')); await deliverToGame(f.name, await f.arrayBuffer()); }
        else if (/\.(osk|zip)$/i.test(f.name)) { await lsAdd(f); toast(T('Skin geladen: ', 'Skin loaded: ') + (S.liveSkin || f.name)); }
        else toast(T('Format nicht unterstützt: ', 'Unsupported format: ') + f.name + ' (.osr, .osz, .osk)', 1);
      } catch { toast(T('Datei konnte nicht verarbeitet werden: ', 'Could not process file: ') + f.name, 1); }
    }
  }, true);

  /* ---------- Player: Leiste, Overlays, Marker ---------- */
  const viewer = q('#viewer'), stage = q('#stage'), cvEl = q('#cv');
  const ov = el('div', { id: 'xOv' }), keys = el('div', { id: 'xKeys' }, '<b id="xKps">0 KPS</b><i>M1</i><i>M2</i><i>K1</i><i>K2</i>');
  const urc = el('canvas', { id: 'xUr', width: 320, height: 26 }), urT = el('div', { id: 'xUrT' }), fpsEl = el('div', { id: 'xFps', hidden: '' });
  const urBox = el('div', { class: 'ur' }); urBox.append(urT, urc);
  const strip = el('div', { id: 'xStrip' }); strip.append(urBox, keys); ov.append(fpsEl); stage.append(ov); stage.after(strip);
  const syncOv = () => { const r = cvEl.getBoundingClientRect(), sr = stage.getBoundingClientRect(); if (!r.width) return; Object.assign(ov.style, { inset: 'auto', left: r.left - sr.left + 'px', top: r.top - sr.top + 'px', width: r.width + 'px', height: r.height + 'px' }); };
  if (window.ResizeObserver) { const ro = new ResizeObserver(syncOv); ro.observe(stage); ro.observe(cvEl); } addEventListener('resize', syncOv); addEventListener('orientationchange', () => setTimeout(syncOv, 250));
  const tl = el('div', { id: 'xTl' }, '<canvas></canvas><i></i>'), tlc = tl.firstChild, tlx = tlc.getContext('2d'), cur = tl.lastChild;
  const prog = el('div', { id: 'xProg', hidden: '' }, '<i></i>'), help = el('div', { id: 'xHelp', hidden: '' });
  const bar = el('div', { id: 'xBar' });
  const BTN = [['rs', '⏮', 'Neustart (R)', 'Restart (R)'], ['fb', '◀', 'Ein Frame zurück (,)', 'Frame back (,)'], ['ff', '▶', 'Ein Frame vor (.)', 'Frame forward (.)'], ['pm', '✕◀', 'Vorheriger Miss ([)', 'Previous miss ([)'], ['nm', '▶✕', 'Nächster Miss (])', 'Next miss (])'], ['m10', '⏪10s', '10 s vor dem nächsten Miss', '10 s before next miss'], ['mu', '🔊', 'Ton: alles / Musik / Hitsounds / stumm (M)', 'Audio: all / music / hitsounds / mute (M)'], ['zm', '🔍', 'Zoom auf Cursor (Z)', 'Zoom on cursor (Z)'], ['st', '📊', 'Statistik & Analyse (S)', 'Stats & analysis (S)'], ['ss', '🖼', 'Screenshot (P)', 'Screenshot (P)'], ['cl', '🎬', 'Clip aufnehmen (10 s)', 'Record clip (10 s)'], ['dl', '⬇', 'Replay als .osr speichern', 'Save replay as .osr'], ['sh', '🔗', 'Link teilen', 'Share link'], ['nt', '📝', 'Notiz an dieser Stelle (N)', 'Note here (N)'], ['ci', '🎞', 'Kino-Modus (C)', 'Cinema mode (C)'], ['fp', '⏱', 'FPS-Anzeige', 'FPS counter'], ['sw', '↔', 'Zum letzten Replay wechseln', 'Switch to previous replay']];
  for (const [id, ic, d, e] of BTN) { const b = el('button', { class: 'xb', type: 'button', 'data-x': id, title: d, 'aria-label': d }); b.dataset.de = d; b.dataset.en = e; b.textContent = ic; bar.append(b); }
  q('#ctl').after(tl, bar); q('#msg').after(prog, help);
  const cineX = el('button', { id: 'xCineX', class: 'xb', type: 'button' }, '✕'); document.body.append(cineX);
  const setT = v => { if (!M) return; t = Math.max(0, Math.min(end, v)); };
  const pause = () => { playing = false; if (audio) audio.pause(); };
  const fIdx = tm => { let l = 0, r = F.length - 1; while (l < r) { const m = (l + r + 1) >> 1; F[m].t <= tm ? l = m : r = m - 1; } return l; };
  tl.addEventListener('pointerdown', e => { const go = ev => { const r = tl.getBoundingClientRect(); setT((ev.clientX - r.left) / r.width * end); }; go(e); tl.setPointerCapture(e.pointerId); tl.onpointermove = go; tl.onpointerup = () => { tl.onpointermove = null; }; });

  function drawMarks() {
    const r = tl.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); tlc.width = Math.max(10, r.width * dpr); tlc.height = Math.max(10, r.height * dpr);
    const w = tlc.width, h = tlc.height, x = tm => tm / end * w; tlx.clearRect(0, 0, w, h);
    if (!M) return;
    tlx.fillStyle = '#7de3d033'; for (const [a, b] of M.br || []) tlx.fillRect(x(a), 0, Math.max(2, x(b) - x(a)), h); // Pausen/Breaks (24)
    for (const [col, res] of [['#ffd16699', 1], ['#ffe94d', 2], ['#ff4d6d', 0]]) { tlx.fillStyle = col; for (const o of M.ho) if (o.res === res && !(o.type & 8)) tlx.fillRect(x(o.hitT ?? o.t), res === 0 ? 0 : h * .3, Math.max(2, dpr * (res === 0 ? 2 : 1)), res === 0 ? h : h * .4); }
    tlx.fillStyle = '#6ea8ff'; for (const n of notes()) { const px = x(n.t); tlx.beginPath(); tlx.moveTo(px - 4 * dpr, h); tlx.lineTo(px + 4 * dpr, h); tlx.lineTo(px, h * .4); tlx.fill(); }
  }
  const notesKey = () => 'osuNotes:' + repKey();
  const notes = () => { try { return JSON.parse(ls.get(notesKey()) || '[]'); } catch { return []; } };

  const press = k => ({ m1: k & 1 && !(k & 4), m2: k & 2 && !(k & 8), k1: k & 4, k2: k & 8 });
  function onNewReplay() {
    X.lastM = M; X.errs = []; X.misses = [];
    for (const o of M.ho) { if (o.res === 0 && !(o.type & 8)) X.misses.push(o.hitT ?? o.t); if (o.res > 0 && !(o.type & 8) && o.hitT != null) X.errs.push({ t: o.hitT, e: (o.hitT - o.t) / (rate || 1), r: o.res }); }
    X.errs.sort((a, b) => a.t - b.t); X.misses.sort((a, b) => a - b);
    drawMarks(); X.zoom = 1; cvEl.style.transform = ''; buildStatsStatic(); applyMute();
    const sp = new URLSearchParams(location.search), st = +sp.get('t'); if (st > 0 && sp.get('score') && !X.tDone) { X.tDone = 1; setT(st); }
    saveReplay();
  }
  function applyMute() {
    if (typeof S === 'undefined') return;
    if (X.mute === 0) { if (X.hs0 != null) { S.hsVol = X.hs0; X.hs0 = null; } } else { if (X.hs0 == null) X.hs0 = S.hsVol; S.hsVol = X.mute === 1 || X.mute === 3 ? 0 : X.hs0; }
    if (audio) audio.muted = X.mute === 2 || X.mute === 3; const b = q('[data-x=mu]'); if (b) b.textContent = ['🔊', '🎵', '🥁', '🔇'][X.mute];
  }

  /* ---------- Hauptschleife der Overlays ---------- */
  let fr = 0, fl = performance.now(), fpsV = 0, ftV = 0, lastU = 0, lastStat = 0;
  function loop(now) {
    requestAnimationFrame(loop); fr++; ftV = now - (loop.p || now); loop.p = now;
    if (now - fl > 500) { fpsV = fr * 1000 / (now - fl); fr = 0; fl = now; if (X.fps) setTxt(fpsEl, `${fpsV.toFixed(0)} FPS · ${ftV.toFixed(1)} ms`); }
    const on = !viewer.hidden && typeof M !== 'undefined' && M && typeof F !== 'undefined' && F && F.length;
    document.body.classList.toggle('x-view', !viewer.hidden);
    if (!on) return;
    if (M !== X.lastM) onNewReplay();
    if (audio && (X.mute === 2 || X.mute === 3) && !audio.muted) audio.muted = true;
    const i = fIdx(t), f = F[i];
    cur.style.left = (t / end * 100) + '%';
    const kk = press(f.k); [...keys.querySelectorAll('i')].forEach((n, j) => n.classList.toggle('on', !![kk.m1, kk.m2, kk.k1, kk.k2][j]));
    let kps = 0; for (let j = i; j > 0 && F[j].t > t - 1000 * (rate || 1); j--) kps += [1, 2, 4, 8].filter(b => F[j].k & b && !(F[j - 1].k & b)).length;
    setTxt(keys.firstChild, kps + ' KPS');
    if (now - lastU > 60) { lastU = now; drawUr(); }
    if (X.stats && now - lastStat > 100) { lastStat = now; updStats(i); }
    if (X.zoom > 1) { const tx = (96 + f.x * 1.5) / 960 * 100, ty = (72 + f.y * 1.5) / 720 * 100; X.zx += (tx - X.zx) * .15; X.zy += (ty - X.zy) * .15; cvEl.style.transformOrigin = `${X.zx}% ${X.zy}%`; cvEl.style.transform = `scale(${X.zoom})`; }
    if (X.demo && !playing && t >= end - 1) { X.demo = false; setTimeout(demoNext, 1800); }
  }
  function drawUr() {
    const g = urc.getContext('2d'); g.clearRect(0, 0, 320, 26); g.fillStyle = '#0008'; g.fillRect(0, 9, 320, 8); g.fillStyle = '#7de3d0'; g.fillRect(159, 3, 2, 20);
    const w = 5000 * (rate || 1); let n = 0;
    for (const p of X.errs) { if (p.t > t || p.t < t - w) continue; const a = 1 - (t - p.t) / w; g.globalAlpha = Math.max(.15, a); g.fillStyle = p.r === 3 ? '#6ea8ff' : p.r === 2 ? '#7de3d0' : '#ffd166'; g.fillRect(160 + Math.max(-150, Math.min(150, p.e)) - 1, 4, 3, 18); n++; }
    g.globalAlpha = 1; const ur = M.stats && M.stats.ur; setTxt(urT, ur ? `UR ${ur.toFixed(1)}` : '');
  }

  /* ---------- Statistik, Graph, Heatmap, Aim (15, 21, 22, 23) ---------- */
  const sp = el('div', { id: 'xStats', hidden: '' }); stage.append(sp);
  let graphImg = null;
  function buildStatsStatic() {
    const s = M.stats || {}, ev = M.ev || [], last = ev[ev.length - 1], acc = last ? last.a : 1;
    const mode = MODES[X.mode] || MODES[0], pp = curScore && typeof curScore.pp === 'number' ? curScore.pp.toFixed(0) + ' pp' : '–';
    sp.innerHTML = `<button type="button" class="xb xclose" data-xclose aria-label="${T('Schließen', 'Close')}">✕</button><b>${T('Statistik', 'Statistics')}</b> <span class="tag ok">${mode} ✓</span>
    <div class="g" style="margin-top:8px"><div><b style="color:#6ea8ff">${s.n3 ?? 0}</b><small>300</small></div><div><b style="color:#7de3d0">${s.n1 ?? 0}</b><small>100</small></div><div><b style="color:#ffd166">${s.n5 ?? 0}</b><small>50</small></div>
    <div><b style="color:#ff4d6d">${s.miss ?? 0}</b><small>Miss</small></div><div><b>${s.mx ?? 0}x</b><small>Max Combo</small></div><div><b>${(acc * 100).toFixed(2)}%</b><small>Acc</small></div>
    <div><b>${s.ur ? s.ur.toFixed(1) : '–'}</b><small>UR</small></div><div><b>${s.avg != null ? s.avg.toFixed(1) + ' ms' : '–'}</b><small>${T('Ø Fehler', 'avg error')}</small></div><div><b>${pp}</b><small>PP</small></div></div>
    <h4>${T('Live', 'Live')}</h4><ul><li><span>Acc / Combo / HP</span><b id="xsL">–</b></li><li><span>${T('Cursor-Tempo', 'Cursor speed')}</span><b id="xsC">–</b></li></ul>
    <h4>${T('Accuracy- & HP-Verlauf', 'Accuracy & HP over time')}</h4><canvas id="xsG" width="280" height="80"></canvas>
    <h4>${T('Klick-Heatmap (Treffer relativ zum Kreis)', 'Click heatmap (hits relative to circle)')}</h4><canvas id="xsH" width="280" height="140"></canvas>
    <h4>${T('Notizen', 'Notes')}</h4><ul id="xsN"></ul>`;
    // Graph vorrendern
    const g0 = document.createElement('canvas'); g0.width = 280; g0.height = 80; const g = g0.getContext('2d'), ev2 = ev.filter((_, i) => i % Math.max(1, ev.length / 280 | 0) === 0);
    const mn = Math.min(.8, ...ev2.map(e => e.a)); g.lineWidth = 2;
    for (const [k, col, lo] of [['a', '#6ea8ff', mn], ['h', '#ff5fa2', 0]]) { g.strokeStyle = col; g.beginPath(); ev2.forEach((e, i) => { const x = e.t / end * 280, y = 78 - (e[k] - lo) / (1 - lo || 1) * 74; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    graphImg = g0;
    // Heatmap
    const hc = sp.querySelector('#xsH').getContext('2d'); hc.fillStyle = '#0006'; hc.fillRect(0, 0, 280, 140); hc.strokeStyle = '#ffffff44'; hc.beginPath(); hc.arc(140, 70, 60, 0, 7); hc.moveTo(80, 70); hc.lineTo(200, 70); hc.moveTo(140, 10); hc.lineTo(140, 130); hc.stroke();
    const R = M.r > 0 ? M.r : 40, hr = (window.curMods | 0) & 16; hc.globalCompositeOperation = 'lighter';
    for (const o of M.ho) { if (!(o.type & 1) || !(o.res > 0) || o.hitT == null) continue; const f = F[fIdx(o.hitT)], dx = (f.x - o.x) / R, dy = (f.y - (hr ? 384 - o.y : o.y)) / R; if (Math.abs(dx) > 1.6 || Math.abs(dy) > 1.6) continue; hc.fillStyle = 'rgba(255,95,162,.35)'; hc.beginPath(); hc.arc(140 + dx * 60, 70 + dy * 60, 4, 0, 7); hc.fill(); }
    hc.globalCompositeOperation = 'source-over';
    renderNotes();
  }
  function renderNotes() { const ul = sp.querySelector('#xsN'); if (!ul) return; const n = notes(); ul.innerHTML = n.length ? n.map((x, i) => `<li><button class="lk" data-note="${i}">${fmt(x.t / (rate || 1))} · ${esc(x.txt)}</button><button class="lk" data-del="${i}" aria-label="x">✕</button></li>`).join('') : `<li><span>${T('Noch keine. Mit „N“ oder 📝 hinzufügen.', 'None yet. Add with “N” or 📝.')}</span></li>`; }
  sp.addEventListener('click', e => { if (e.target.closest('[data-xclose]')) { SHORT.st(); return; } const a = e.target.closest('[data-note]'), d = e.target.closest('[data-del]'); if (a) setT(notes()[a.dataset.note].t - 1000 * (rate || 1)); if (d) { const n = notes(); n.splice(+d.dataset.del, 1); ls.set(notesKey(), JSON.stringify(n)); renderNotes(); drawMarks(); } });
  function updStats(i) {
    const ev = M.ev || []; let l = 0, r = ev.length - 1; while (l < r) { const m = (l + r + 1) >> 1; ev[m].t <= t ? l = m : r = m - 1; } const e = ev[l] && ev[l].t <= t ? ev[l] : null;
    const L = sp.querySelector('#xsL'); if (L) setTxt(L, e ? `${(e.a * 100).toFixed(2)}% · ${e.c}x · ${(e.h * 100).toFixed(0)}%` : '–');
    const f = F[i], p = F[Math.max(0, i - 1)], dt = (f.t - p.t) / (rate || 1), C = sp.querySelector('#xsC'); if (C) setTxt(C, dt > 0 ? `${(Math.hypot(f.x - p.x, f.y - p.y) / dt * 1000).toFixed(0)} px/s` : '–');
    const g = sp.querySelector('#xsG'); if (g && graphImg) { const c = g.getContext('2d'); c.clearRect(0, 0, 280, 80); c.drawImage(graphImg, 0, 0); c.fillStyle = '#fff'; c.fillRect(t / end * 280, 0, 1.5, 80); }
  }

  /* ---------- Aktionen der Leiste ---------- */
  const SHORT = { rs: () => { setT(Math.max(0, M.ho[0].t - 2000)); }, fb: () => step(-1), ff: () => step(1), pm: () => jumpMiss(-1, 1500), nm: () => jumpMiss(1, 1500), m10: () => jumpMiss(1, 10000), mu: () => { X.mute = (X.mute + 1) % 4; applyMute(); toast([T('Ton: alles', 'Audio: all'), T('Nur Musik', 'Music only'), T('Nur Hitsounds', 'Hitsounds only'), T('Stumm', 'Muted')][X.mute]); }, zm: () => { X.zoom = X.zoom === 1 ? 2 : X.zoom === 2 ? 3 : 1; if (X.zoom === 1) { cvEl.style.transform = ''; } q('[data-x=zm]').classList.toggle('on', X.zoom > 1); toast(X.zoom + 'x Zoom'); }, st: () => { X.stats = !X.stats; sp.hidden = !X.stats; q('[data-x=st]').classList.toggle('on', X.stats); }, ss: screenshot, cl: clip, dl: saveOsr, sh: share, nt: addNote, ci: cinema, fp: () => { X.fps = !X.fps; fpsEl.hidden = !X.fps; q('[data-x=fp]').classList.toggle('on', X.fps); }, sw: switchLast };
  bar.addEventListener('click', e => { const b = e.target.closest('[data-x]'); if (b && M) SHORT[b.dataset.x](); });
  function step(d, ms) { pause(); if (ms) return setT(t + d * ms * (rate || 1)); const i = fIdx(t); setT(d > 0 ? F[Math.min(F.length - 1, i + 1)].t : F[F[i].t < t - .5 ? i : Math.max(0, i - 1)].t); }
  function jumpMiss(d, lead) {
    if (!X.misses.length) return toast(T('Keine Misses in diesem Replay 🎉', 'No misses in this replay 🎉'));
    const L = lead * (rate || 1), r = rate || 1, m = d > 0 ? X.misses.find(x => x - L > t + 50 * r) : [...X.misses].reverse().find(x => x - L < t - 400 * r);
    if (m == null) return toast(T('Kein weiterer Miss', 'No more misses')); setT(m - L);
  }
  function screenshot() { cvEl.toBlob(b => { if (b) { download(b, clean(q('#title').textContent) + '.png'); toast(T('Screenshot gespeichert', 'Screenshot saved')); } }, 'image/png'); }
  function saveOsr() { if (!osrBuf) return toast(T('Keine Replay-Datei vorhanden', 'No replay file'), 1); download(new Blob([osrBuf], { type: 'application/octet-stream' }), clean(q('#title').textContent) + '.osr'); toast(T('Replay gespeichert', 'Replay saved')); }
  async function share() {
    const id = curScore && curScore.id; if (!id) { saveOsr(); return toast(T('Lokale Replays haben keinen Link. Die .osr-Datei zum Teilen wurde gespeichert.', 'Local replays have no link. The .osr file was saved for sharing.')); }
    const u = `${location.origin}/?score=${id}&t=${Math.round(t)}`; try { await navigator.clipboard.writeText(u); toast(T('Link kopiert (mit aktueller Zeitmarke)', 'Link copied (with current time)')); } catch { prompt('Link', u); }
  }
  function addNote() { const txt = prompt(T('Notiz an ' + fmt(t / (rate || 1)), 'Note at ' + fmt(t / (rate || 1)))); if (!txt) return; const n = notes(); n.push({ t, txt: txt.slice(0, 120) }); n.sort((a, b) => a.t - b.t); ls.set(notesKey(), JSON.stringify(n)); renderNotes(); drawMarks(); toast(T('Notiz gespeichert', 'Note saved')); }
  function cinema(on) { const v = typeof on === 'boolean' ? on : !document.body.classList.contains('x-cine'); document.body.classList.toggle('x-cine', v); if (v && viewer.requestFullscreen) viewer.requestFullscreen().catch(() => {}); if (!v && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); }
  cineX.onclick = () => cinema(false);
  addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) document.body.classList.remove('x-cine'); });
  async function clip() {
    if (X.rec) return; if (!window.MediaRecorder || !cvEl.captureStream) return toast(T('Dein Browser kann keine Clips aufnehmen.', 'Your browser cannot record clips.'), 1);
    try {
      const st = cvEl.captureStream(30); try { const as = audio && (audio.captureStream ? audio.captureStream() : audio.mozCaptureStream && audio.mozCaptureStream()); if (as) as.getAudioTracks().forEach(tr => st.addTrack(tr)); } catch {}
      const mt = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)), rec = new MediaRecorder(st, mt ? { mimeType: mt, videoBitsPerSecond: 4e6 } : {}), parts = [];
      rec.ondataavailable = e => e.data.size && parts.push(e.data); rec.onstop = () => { X.rec = null; q('[data-x=cl]').classList.remove('on'); download(new Blob(parts, { type: 'video/webm' }), clean(q('#title').textContent) + '.webm'); toast(T('Clip gespeichert (.webm)', 'Clip saved (.webm)')); };
      X.rec = rec; rec.start(); q('[data-x=cl]').classList.add('on'); toast(T('Aufnahme läuft: 10 s', 'Recording: 10 s')); if (!playing) q('#pp').click(); setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 10000);
    } catch (e) { X.rec = null; toast(T('Aufnahme fehlgeschlagen.', 'Recording failed.'), 1); }
  }
  async function switchLast() { const l = await allReplays(); const o = l.find(r => r.key !== X.cur); if (!o) return toast(T('Noch kein zweites Replay gespeichert', 'No second replay saved yet')); openSaved(o.key); }

  /* ---------- Tastatur (13, 71) ---------- */
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSheet('tools'); return; }
    if (e.target.matches && e.target.matches('input,textarea,select')) return;
    if (e.key === '?') { openSheet('help'); return; }
    if (viewer.hidden || !M || !q('#vp').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, sh = e.shiftKey; let h = true;
    if (k === ',') step(-1, sh ? 1 : 0); else if (k === '.') step(1, sh ? 1 : 0);
    else if (k === ' ') q('#pp').click();
    else if (k === 'ArrowLeft') setT(t - 5000 * (rate || 1)); else if (k === 'ArrowRight') setT(t + 5000 * (rate || 1));
    else if (k === 'ArrowUp' || k === 'ArrowDown') { if (audio) audio.volume = Math.max(0, Math.min(1, audio.volume + (k === 'ArrowUp' ? .1 : -.1))); }
    else if (k === 'r' || k === 'R') SHORT.rs(); else if (k === '[') SHORT.pm(); else if (k === ']') SHORT.nm();
    else if (k === 'm' || k === 'M') SHORT.mu(); else if (k === 'z' || k === 'Z') SHORT.zm(); else if (k === 's' || k === 'S') SHORT.st();
    else if (k === 'p' || k === 'P') SHORT.ss(); else if (k === 'n' || k === 'N') { e.preventDefault(); SHORT.nt(); } else if (k === 'c' || k === 'C') cinema();
    else if (k === 'Escape' && document.body.classList.contains('x-cine')) cinema(false);
    else h = false; if (h) e.preventDefault();
  });

  /* ---------- Status, Fortschritt, Fehlerhilfe, Modus (5, 12, 29, 30, 83) ---------- */
  const _po = window.parseOsr; if (typeof _po === 'function') window.parseOsr = async b => { const r = await _po(b); X.mode = r.mode | 0; return r; };
  const STEPS = [[/Lade Replay/, 20], [/Lade Beatmap/, 45], [/Lade Ton/, 75], [/Tippe|Kein Ton/, 100]];
  const msgEl = q('#msg');
  const retry = () => { if (curScore) openReplay(curScore); };
  new MutationObserver(() => {
    let m = msgEl.textContent.trim(), hit = STEPS.find(([r]) => r.test(m));
    prog.hidden = !hit; if (hit) prog.firstChild.style.width = hit[1] + '%';
    if (/nur osu!standard/.test(m)) { m = msgEl.textContent = T(`${MODES[X.mode] || 'Dieser Modus'} wurde erkannt, ist aber noch in Entwicklung. Unterstützt wird aktuell: osu!standard.`, `${MODES[X.mode] || 'This mode'} detected but still in development. Currently supported: osu!standard.`); }
    const H = [[/Beatmap konnte nicht/, T('Die Beatmap konnte von keinem Mirror geladen werden.', 'The beatmap could not be loaded from any mirror.'), T('Prüfe deine Verbindung oder versuche es gleich noch einmal.', 'Check your connection or try again shortly.')],
      [/Kein Ton/, T('Das Audio der Beatmap ist nicht erreichbar.', 'The beatmap audio is unavailable.'), T('Das Replay läuft auch ohne Ton. „Ton erneut laden“ fragt die Mirrors neu ab.', 'The replay also works without sound. “Reload audio” asks the mirrors again.'), 'audio'],
      [/Replay-Download fehlgeschlagen|Anmeldung nötig/, T('Das Replay konnte nicht von osu! geladen werden.', 'The replay could not be downloaded from osu!.'), T('osu! gibt Replays nur an angemeldete Nutzer heraus. Melde dich an oder öffne eine .osr-Datei.', 'osu! only serves replays to logged-in users. Log in or open an .osr file.')],
      [/Replay konnte nicht gelesen/, T('Die Replay-Datei ist beschädigt oder unvollständig.', 'The replay file is damaged or incomplete.'), T('Lade die Datei neu herunter oder wähle eine andere.', 'Download the file again or pick another one.')]].find(([r]) => r.test(m));
    if (!H) { help.hidden = true; return; }
    help.hidden = false; help.innerHTML = `<b>${H[1]}</b><p>${H[2]}</p><div class="r"><button class="ghost" data-h="${H[3] === 'audio' ? 'audio' : 'retry'}">${H[3] === 'audio' ? T('Ton erneut laden', 'Reload audio') : T('Erneut versuchen', 'Retry')}</button><button class="ghost" data-h="close">${T('Schließen', 'Close')}</button></div>`;
  }).observe(msgEl, { childList: true, characterData: true, subtree: true });
  help.addEventListener('click', e => { const a = e.target.closest('[data-h]'); if (!a) return; if (a.dataset.h === 'audio' && typeof retryAudio === 'function') retryAudio(); else if (a.dataset.h === 'retry') retry(); else q('#close').click(); });
  const vt = q('#verrt'); if (vt) new MutationObserver(() => { const b = q('#verr b'); if (b) b.textContent = /dekodiert/.test(vt.textContent) ? T('Video-Format nicht unterstützt', 'Video format not supported') : /Netzwerk/.test(vt.textContent) ? T('Video: Verbindungsproblem', 'Video: connection problem') : T('Video nicht ladbar', 'Video unavailable'); }).observe(vt, { childList: true, characterData: true, subtree: true });

  const gm = q('#gMsg'); if (gm) new MutationObserver(() => { if (/nur osu!standard/.test(gm.textContent)) gm.textContent = T(`${MODES[X.mode] || 'Dieser Modus'} wurde erkannt, ist aber noch in Entwicklung. Unterstützt wird aktuell: osu!standard.`, `${MODES[X.mode] || 'This mode'} detected but still in development. Currently supported: osu!standard.`); }).observe(gm, { childList: true, characterData: true, subtree: true });
  const btnTitles = () => BTN.forEach(([id, , d, en]) => { const b = q(`[data-x=${id}]`); b.title = lang === 'en' ? en : d; b.setAttribute('aria-label', b.title); });

  /* ---------- Online/Offline sauber prüfen (6) ---------- */
  async function netCheck() { let ok = navigator.onLine; if (!ok) { try { ok = (await fetch('/manifest.json', { cache: 'no-store' })).ok; } catch { ok = false; } } const b = q('#offlineBar'); if (b) b.hidden = ok; }
  addEventListener('online', netCheck); addEventListener('offline', () => setTimeout(netCheck, 800)); setTimeout(netCheck, 1200);

  /* ---------- Browser-Zurück schließt den Player (87) ---------- */
  let vOpen = false;
  setInterval(() => { const o = !viewer.hidden; if (o && !vOpen) { vOpen = true; try { history.pushState({ osuViewer: 1 }, ''); } catch {} } else if (!o && vOpen) { vOpen = false; try { if (history.state && history.state.osuViewer) history.back(); } catch {} showLast(); } }, 400);
  addEventListener('popstate', () => { if (vOpen && !viewer.hidden && !(history.state && history.state.osuViewer)) { vOpen = false; q('#close').click(); } });

  /* ---------- „Zurück zum letzten Replay“ (11) ---------- */
  const lastBtn = el('button', { id: 'xLast', type: 'button', hidden: '' }); 
  async function showLast() {}
  lastBtn.onclick = () => { lastBtn.hidden = true; if (X.cur) openSaved(X.cur); };
  new MutationObserver(() => { if (!viewer.hidden) lastBtn.hidden = true; }).observe(viewer, { attributes: true, attributeFilter: ['hidden'] });

  /* ---------- Demo-Modus & Zufall (72, 82) ---------- */
  async function randomReplay() { const l = await allReplays(); if (!l.length) return toast(T('Noch keine gespeicherten Replays. Öffne zuerst eins.', 'No saved replays yet. Open one first.'), 1); const r = l[Math.random() * l.length | 0]; return openSaved(r.key); }
  async function demoNext() { if (!X.demoOn) return; await randomReplay(); await sleep(2500); if (M && !playing) q('#pp').click(); X.demo = true; }
  async function demoStart() { const l = await allReplays(); if (!l.length) return toast(T('Für den Demo-Modus brauchst du gespeicherte Replays.', 'Demo mode needs saved replays.'), 1); X.demoOn = true; closeSheet(); await demoNext(); toast(T('Demo-Modus aktiv. Zum Beenden Player schließen.', 'Demo mode on. Close the player to stop.')); }
  q('#close').addEventListener('click', () => { X.demoOn = false; X.demo = false; cinema(false); X.mute = 0; applyMute(); });

  /* ---------- Lite-Modus (58) ---------- */
  const lite = () => ls.get('osuLite') === '1';
  function applyLite() { document.body.classList.toggle('x-lite', lite()); if (lite() && typeof S !== 'undefined') { S.trail = false; } }

  /* ---------- Hub: Menü, Hilfe, Über, Neu, Diagnose (62–66, 70, 71, 90, 94, 97) ---------- */
  const CHANGES = [['0.64', ['Profil: Team & Gruppen neu gestaltet (Team-Logo, Kürzel, farbige Gruppen-Chips)']], ['0.63', ['Ranglisten: Tipp auf einen Spieler öffnet sein Profil']], ['0.62', ['Ranglisten: Top 100 Spieler je Modus (osu!, taiko, catch, mania) nach pp oder Punkten']], ['0.61', ['Große Skins laden (Direkt-Download mit Fortschritt, höhere Limits)','Skin wird zuverlässig ins Spiel übernommen','Hitsounds auch in osu!taiko, catch und mania','Hitsound-Suche im Skin findet auch Dateien ohne normal-/soft-Präfix']], ['0.60', ['Skin-Unterstützung in osu!taiko, catch und mania (Noten, Tasten, Früchte, Catcher, Trommel, Rolls)','Knopf „Letztes Replay“ im Startmenü entfernt']], ['0.59', ['osu!taiko, osu!catch und osu!mania: Replays ansehen, Modus-Umschalter für Scores, Scroll-Geschwindigkeit (Auswertung aus den Eingaben geschätzt)']], ['0.58', ['Release-Pflege: Versionen, Manifest und Doku abgeglichen; Profil-Fixes aus 0.54–0.57 gebündelt']], ['0.53', ['Erster Start: Englisch als Standard und Vollbild-Auswahl Englisch/Deutsch']], ['0.52', ['Einstellungen: Bereiche als Knöpfe statt Ausklappen','Englisch-Übersetzung für Tutorial, Einstellungen, Meldungen und Fehlertexte erweitert']], ['0.51', ['Statistik-Fenster hat einen Schließen-Knopf (auch Esc)']], ['0.50', ['Tasten-Anzeige (M1/M2/K1/K2, KPS) und UR-Balken liegen jetzt in einer Leiste unter dem Spielfeld, nicht mehr im Replay']], ['0.49', ['Player responsive: kompakte Kopfzeile am Handy, Seitenleiste auf Tablet/PC, Tasten-Overlay und UR-Balken überlappen nicht mehr']], ['0.48', ['Kein Menü-Overlay mehr: Import, Replays, Hilfe, Neuigkeiten und App-Optionen sind jetzt in den Einstellungen','Responsive Raster für Handy, Tablet und PC','Roadmap um Spiel-Funktionen erweitert']], ['0.46', ['Player: Frame-Schritte, Timeline-Marker, Hit-Error-Bar, Input-Overlay mit KPS, Statistik mit Graph und Heatmap, Zoom, Kino-Modus, Screenshot, Clip-Aufnahme', 'Gespeicherte Replays, Favoriten, „Zurück zum letzten Replay“, Demo-Modus', 'Schnell-Import per Link/ID, Drag & Drop auf der ganzen Seite, Beispiel-Map beim ersten Spielstart', 'Deutsch/Englisch, Toasts, Hilfe bei Fehlern, Speicherverwaltung, Diagnose']], ['0.45', ['Spiel-Menü: Account-Import und Schließen, Datei-Dialog-Fix, WebGL-Umstellung, Skin-Download repariert']]];
  const ROAD = [['A/B-Replay-Vergleich', 'wip'], ['PP-Verlauf (Live)', 'wip'], ['Embed-Widget', 'wip'], ['Over-/Underaim-Analyse', 'wip']];
  const GAME = () => [T('Touch-Optimierung','Touch optimisation'), T('Keybind-Editor','Keybind editor'), T('Offset-Kalibrierung','Offset calibration'), T('Practice-Modus','Practice mode'), T('Eigene Plays als .osr speichern','Save own plays as .osr'), T('HUD-Editor','HUD editor'), T('Fertige Community-Skins','Ready-made community skins')];
  const FORMATS = () => [['.osr', T('Replay – direkt abspielen', 'Replay – play directly')], ['.osz', T('Beatmap-Paket – in nicominecith osu! importieren', 'Beatmap pack – import into nicominecith osu!')], ['.osk', T('Skin – Cursor, Hitcircles, Zahlen, Sounds', 'Skin – cursor, hitcircles, numbers, sounds')], [T('Audio/Bilder', 'Audio/images'), T('kommen aus der Beatmap (mp3, ogg, wav, jpg, png)', 'come from the beatmap (mp3, ogg, wav, jpg, png)')]];
  const SC = () => [['Space', T('Abspielen / Pause', 'Play / pause')], ['← →', T('5 s zurück / vor', '5 s back / forward')], [', .', T('Frame zurück / vor (Shift: 1 ms)', 'Frame back / forward (Shift: 1 ms)')], ['[ ]', T('Vorheriger / nächster Miss', 'Previous / next miss')], ['R', T('Neustart', 'Restart')], ['↑ ↓', T('Lautstärke', 'Volume')], ['M', T('Ton: alles / Musik / Hitsounds / stumm', 'Audio: all / music / hitsounds / mute')], ['Z', T('Zoom 2x / 3x / aus', 'Zoom 2x / 3x / off')], ['S', T('Statistik', 'Stats')], ['P', T('Screenshot', 'Screenshot')], ['N', T('Notiz', 'Note')], ['C', T('Kino-Modus', 'Cinema mode')], ['Ctrl+K', T('Schnell-Import', 'Quick import')], ['?', T('Diese Übersicht', 'This overview')]];
  const hub = el('section', { id: 'xHub' }, '<div id="xQ"><b></b><small></small><div class="qr"><input type="text" id="xLink" placeholder="https://osu.ppy.sh/scores/…" autocomplete="off" aria-label="Link"><button class="btn" type="button" data-a="imp"></button></div></div><div id="xGrid"></div>');
  const sheet = hub; document.body.append(drop, tbox);
  const SECS = ['replays', 'tools', 'help', 'new', 'diag', 'about'];
  const seenV = () => ls.get('osuSeenVer') === VER;
  const TABS = () => [['replays', '▶ ' + T('Meine Replays', 'My replays')], ['tools', '⚙ ' + T('App & Einstellungen', 'App & settings')], ['help', '❓ ' + T('Hilfe', 'Help')], ['new', '✨ ' + T('Neu & Roadmap', 'New & roadmap')], ['diag', '🛠 ' + T('Feedback & Diagnose', 'Feedback & diagnostics')], ['about', 'ℹ ' + T('Über', 'About')]];
  function buildHub() {
    const g = q('#xGrid'); if (g.children.length) return;
    g.innerHTML = '<div class="xnav">' + SECS.map(k => `<button type="button" class="xn" data-sec="${k}"></button>`).join('') + '</div>' + SECS.map(k => `<section class="xsec" data-k="${k}" hidden><button type="button" class="ghost xback" data-sec=""></button><h3 class="xst"></h3><div class="xdb" id="xS_${k}"></div></section>`).join('');
  }
  function showSec(k) {
    const nav = q('#xGrid .xnav'); if (!nav) return; nav.hidden = !!k;
    qa('#xGrid .xsec').forEach(x => { x.hidden = x.dataset.k !== k; });
    if (k === 'new') { ls.set('osuSeenVer', VER); qa('#xHub .nw').forEach(n => n.remove()); }
    hub.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  hub.addEventListener('click', e => { const b = e.target.closest('[data-sec]'); if (b) showSec(b.dataset.sec); });
  function placeHub() {
    const st = q('#settings'), sb = q('#setBody');
    if (!st || !sb || st.hidden) return;
    if (hub.parentNode !== sb) { sb.append(hub); renderSheet(); }
  }
  for (const id of ['#settings', '#setBody']) new MutationObserver(placeHub).observe(q(id), { attributes: true, attributeFilter: ['hidden'], childList: id === '#setBody' });
  function openSheet(t2) { showSec(t2 || ''); }
  function closeSheet() {}
  async function renderSheet() {
    buildHub();
    q('#xQ b').textContent = '🔗 ' + T('Schnell-Import', 'Quick import');
    q('#xQ small').textContent = T('osu!-Score-Link, .osr-Link oder Beatmap-Set-Link/-ID einfügen.', 'Paste an osu! score link, .osr link or beatmap set link/ID.');
    q('#xQ button').textContent = T('Laden', 'Load');
    TABS().forEach(([k, n]) => { const nb = q(`#xGrid .xn[data-sec="${k}"]`), sc = q(`#xGrid .xsec[data-k="${k}"]`); if (!nb) return; nb.innerHTML = n + (k === 'new' && !seenV() ? ' <span class="nw">NEU</span>' : ''); sc.querySelector('.xst').textContent = n; sc.querySelector('.xback').textContent = '← ' + T('Zurück', 'Back'); });
    await Promise.all(SECS.map(renderTab));
  }
  async function renderTab(tab) {
    const b = q('#xS_' + tab); if (!b) return;
    if (tab === 'tools') {
      b.innerHTML = `<h3>${T('Sprache', 'Language')}</h3><div class="row"><button class="ghost" data-a="lang-de">Deutsch</button><button class="ghost" data-a="lang-en">English</button></div><p>${T('Die Übersetzung deckt Startseite und Player-Leiste ab, nicht jeden Satz im Tutorial oder in den Einstellungen.', 'The translation covers the home page and player bar, not every sentence in the tutorial or settings.')}</p>
      <h3>${T('Leistung', 'Performance')}</h3><div class="row"><button class="ghost" data-a="lite">${lite() ? T('Energiesparmodus: AN', 'Power saving: ON') : T('Energiesparmodus: aus', 'Power saving: off')}</button></div><p>${T('Schaltet Trail, Animationen und Unschärfe ab – für ältere Handys.', 'Disables trail, animations and blur – for older phones.')}</p>
      <h3>${T('Einstellungen sichern / teilen', 'Back up / share settings')}</h3><div class="row"><button class="ghost" data-a="exp">${T('Code kopieren', 'Copy code')}</button><button class="ghost" data-a="imps">${T('Code einfügen', 'Paste code')}</button><button class="ghost" data-a="reset">${T('Auf Standard zurücksetzen', 'Reset to defaults')}</button></div>
      <h3>${T('Speicher', 'Storage')}</h3><p id="xSt">…</p><div class="row"><button class="ghost" data-a="cc">${T('Offline-Cache leeren', 'Clear offline cache')}</button><button class="ghost" data-a="cr">${T('Gespeicherte Replays löschen', 'Delete saved replays')}</button></div>`;
      try { const e = await navigator.storage.estimate(); q('#xSt').textContent = T('Belegt: ', 'Used: ') + (e.usage / 1e6).toFixed(1) + ' MB / ' + (e.quota / 1e9).toFixed(1) + ' GB'; } catch { q('#xSt').textContent = T('Nicht ermittelbar', 'Not available'); }
    } else if (tab === 'replays') {
      const l = await allReplays();
      b.innerHTML = `<div class="row"><button class="ghost" data-a="rnd">🎲 ${T('Zufälliges Replay', 'Random replay')}</button><button class="ghost" data-a="demo">📺 ${T('Demo-Modus', 'Demo mode')}</button></div>
      <p>${T('Zuletzt angesehene Replays werden nur in deinem Browser gespeichert (max. 12 + Favoriten).', 'Recently viewed replays are stored only in your browser (max. 12 + favorites).')}</p>` +
        (l.length ? l.map(r => `<div class="xi"><div><b>${esc(r.title)}</b><small>${new Date(r.ts).toLocaleString()} · ${(r.size / 1e3).toFixed(0)} kB</small></div><button class="ghost" data-fav="${esc(r.key)}" aria-label="Favorit">${r.fav ? '★' : '☆'}</button><button class="ghost" data-open="${esc(r.key)}">▶</button><button class="ghost" data-rm="${esc(r.key)}" aria-label="Löschen">🗑</button></div>`).join('') : `<p>${T('Noch nichts gespeichert.', 'Nothing saved yet.')}</p>`);
    } else if (tab === 'help') {
      b.innerHTML = `<h3>${T('So funktioniert’s in 10 Sekunden', 'How it works in 10 seconds')}</h3><p>1 · ${T('Replay öffnen (.osr ziehen, Link einfügen oder mit osu! anmelden)', 'Open a replay (drop .osr, paste a link or log in)')}<br>2 · ${T('Abspielen, spulen, Frames prüfen, Misses anspringen', 'Play, seek, check frames, jump to misses')}<br>3 · ${T('Statistik ansehen, Screenshot/Clip speichern, Link teilen', 'View stats, save a screenshot/clip, share a link')}</p>
      <h3>${T('Tastenkürzel', 'Shortcuts')}</h3><table>${SC().map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table>
      <h3>${T('Unterstützte Dateien', 'Supported files')}</h3><table>${FORMATS().map(([k, d]) => `<tr><td><kbd>${k}</kbd></td><td>${d}</td></tr>`).join('')}</table>
      <h3>${T('Spielmodi', 'Game modes')}</h3><table>${MODES.map((m, i) => `<tr><td>${m}</td><td><span class="tag ${i ? 'wip' : 'ok'}">${i ? T('in Entwicklung', 'in development') : T('unterstützt', 'supported')}</span></td></tr>`).join('')}</table>`;
    } else if (tab === 'new') {
      b.innerHTML = CHANGES.map(([v, l]) => `<h3>v${v}</h3><ul>${l.map(x => `<li>${x}</li>`).join('')}</ul>`).join('') + `<h3>${T('Roadmap', 'Roadmap')}</h3>` + ROAD.map(([n, k]) => `<div class="xi"><div>${n}</div><span class="tag ${k}">${T('geplant', 'planned')}</span></div>`).join('') + `<h3>${T('Eingebautes Spiel', 'Built-in game')}</h3><p>${T('Das Spiel ist ein fertig gebautes Paket. Jeder dieser Punkte braucht eigene Arbeit.', 'The game is a prebuilt package. Each of these needs its own work.')}</p>` + GAME().map(n => `<div class="xi"><div>${n}</div><span class="tag wip">${T('geplant', 'planned')}</span></div>`).join('') + `<h3>${T('Wunschliste', 'Wish list')}</h3><p>${T('Schreib im Tab „Diagnose“ dein Feature-Wunsch und kopiere ihn an den Entwickler.', 'Write your feature wish in the “Diagnostics” tab and send it to the developer.')}</p>`;
    } else if (tab === 'about') {
      b.innerHTML = `<h3>Osu Replay</h3><p>${T('Kostenloses Fan-Projekt von Nicominecith. Inoffiziell: gehört nicht zu osu! oder ppy. osu! ist eine Marke von ppy Pty Ltd.', 'Free fan project by Nicominecith. Unofficial: not affiliated with osu! or ppy. osu! is a trademark of ppy Pty Ltd.')}</p>
      <h3>${T('Technik', 'Tech')}</h3><p>HTML5 Canvas · Web Audio · LZMA · Netlify Functions · PWA · IndexedDB</p><h3>${T('Kontakt', 'Contact')}</h3><p><a href="https://github.com/Nicominecith" target="_blank" rel="noopener" style="color:var(--mint)">github.com/Nicominecith</a></p>
      <h3>${T('Lizenz & Daten', 'License & data')}</h3><p>${T('Beatmaps stammen von Community-Mirrors. Deine Replays und Einstellungen bleiben im Browser.', 'Beatmaps come from community mirrors. Your replays and settings stay in your browser.')}</p>`;
    } else {
      b.innerHTML = `<h3>${T('Feedback / Bug melden', 'Feedback / report a bug')}</h3><textarea id="xFb" placeholder="${T('Was ist passiert oder was wünschst du dir?', 'What happened or what do you wish for?')}"></textarea><label style="display:block;margin:8px 0"><input type="checkbox" id="xFbI" checked> ${T('Geräte- und Fehlerinfos anhängen', 'Attach device and error info')}</label><div class="row"><button class="btn" data-a="fb" style="padding:10px 20px">${T('Kopieren / Teilen', 'Copy / share')}</button></div>
      <h3>${T('Debug-Log', 'Debug log')}</h3><textarea readonly id="xLog">${esc(LOG.join('\n') || '–')}</textarea><p>${T('Parser: ', 'Parser: ')}${M ? `${M.ho.length} ${T('Objekte', 'objects')}, ${F ? F.length : 0} Frames, ${T('Modus', 'mode')} ${MODES[X.mode]}` : '–'}</p>`;
    }
  }
  const diagText = () => `Osu Replay v${VER}\nUA: ${navigator.userAgent}\nScreen: ${screen.width}x${screen.height} @${devicePixelRatio}\nOnline: ${navigator.onLine}\nLang: ${lang}\nReplay: ${M ? q('#title').textContent : '-'}\nFPS: ${fpsV.toFixed(0)}\n--- Log ---\n${LOG.slice(-30).join('\n')}`;
  sheet.addEventListener('click', e => sheetClick(e).catch(err => { console.warn('Menü', err); toast(T('Aktion fehlgeschlagen.', 'Action failed.'), 1); }));
  async function sheetClick(e) {
    const o = e.target.closest('[data-open]'); if (o) return openSaved(o.dataset.open);
    const fv = e.target.closest('[data-fav]'); if (fv) { const r = await db('readonly', s => s.get(fv.dataset.fav)); r.fav = !r.fav; await db('readwrite', s => s.put(r)); return renderSheet(); }
    const rm = e.target.closest('[data-rm]'); if (rm) { await db('readwrite', s => s.delete(rm.dataset.rm)); return renderSheet(); }
    const a = e.target.closest('[data-a]'); if (!a) return; const k = a.dataset.a;
    if (k === 'imp') quickImport(q('#xLink').value);
    else if (k === 'lang-de' || k === 'lang-en') { lang = k.slice(5); ls.set('osuLang', lang); translate(); dropTxt(); btnTitles(); renderSheet(); toast(lang === 'en' ? 'Language: English' : 'Sprache: Deutsch'); }
    else if (k === 'lite') { ls.set('osuLite', lite() ? '0' : '1'); applyLite(); renderSheet(); }
    else if (k === 'exp') { try { await navigator.clipboard.writeText(btoa(unescape(encodeURIComponent(JSON.stringify({ S, lite: lite() }))))); toast(T('Code kopiert', 'Code copied')); } catch { toast(T('Kopieren nicht möglich', 'Copy failed'), 1); } }
    else if (k === 'imps') { const c = prompt(T('Code einfügen', 'Paste code')); if (!c) return; try { const d = JSON.parse(decodeURIComponent(escape(atob(c.trim())))); Object.assign(S, d.S || {}); saveS(); ls.set('osuLite', d.lite ? '1' : '0'); applyLite(); toast(T('Einstellungen übernommen', 'Settings applied')); } catch { toast(T('Ungültiger Code', 'Invalid code'), 1); } }
    else if (k === 'reset') { if (confirm(T('Alle Einstellungen (Skin-Auswahl, HUD, Ton) auf Standard zurücksetzen?', 'Reset all settings to defaults?'))) { ls.del('osuSet'); ls.del('osuLite'); location.reload(); } }
    else if (k === 'cc') { for (const n of await caches.keys()) await caches.delete(n); toast(T('Cache geleert', 'Cache cleared')); renderSheet(); }
    else if (k === 'cr') { if (confirm(T('Alle gespeicherten Replays löschen?', 'Delete all saved replays?'))) { await db('readwrite', s => s.clear()); X.cur = null; toast(T('Gelöscht', 'Deleted')); renderSheet(); } }
    else if (k === 'rnd') randomReplay(); else if (k === 'demo') demoStart();
    else if (k === 'fb') { const txt = (q('#xFb').value || '') + (q('#xFbI').checked ? '\n\n' + diagText() : ''); if (navigator.share) { try { await navigator.share({ title: 'Osu Replay Feedback', text: txt }); return; } catch {} } try { await navigator.clipboard.writeText(txt); toast(T('Kopiert. Schick den Text an den Entwickler.', 'Copied. Send it to the developer.')); } catch { toast(T('Kopieren nicht möglich', 'Copy failed'), 1); } }
  }
  sheet.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'xLink') quickImport(e.target.value); });

  /* ---------- Startseite: Kurz-Überblick (9, 94) ---------- */
  function hint() {
    for (const id of ['#login', '#guest']) { const s = q(id); if (!s || s.querySelector('.x-hint')) continue; const u = el('ul', { class: 'x-hint' }); u.innerHTML = `<li><b>1</b> ${T('Replay öffnen', 'Open replay')}</li><li><b>2</b> ${T('Abspielen & analysieren', 'Play & analyse')}</li><li><b>3</b> ${T('Teilen oder als Clip speichern', 'Share or save as clip')}</li><li>.osr · .osz · .osk</li>`; (s.querySelector('.gh') || s.firstElementChild).after(u); }
  }

  /* ---------- Sprache: DE/EN für die Hauptoberfläche (8) ---------- */
  const EN = { 'Replay-Datei öffnen': 'Open replay file', 'Spieler suchen': 'Search player', 'Spielen': 'Play', 'Einstellungen': 'Settings', 'Tutorial': 'Tutorial', 'Mit osu! verbinden': 'Connect with osu!', 'Zum Login': 'To login', 'Ohne Anmeldung': 'No login', 'Ohne Anmeldung nutzen': 'Use without login', 'Details': 'Details', 'Schließen': 'Close', 'Replay ansehen': 'Watch replay', 'Neu laden': 'Reload', 'Im Browser öffnen': 'Open in browser', 'Weiter': 'Next', 'Fertig': 'Done', 'Zurück': 'Back', 'Überspringen': 'Skip', 'Lade Replay…': 'Loading replay…', 'Lade Beatmap…': 'Loading beatmap…', 'Lade Ton…': 'Loading audio…', 'Tippe ▶ zum Start': 'Tap ▶ to start', 'Kein Replay verfügbar': 'No replay available', 'Du bist offline – gespeicherte Inhalte werden genutzt.': 'You are offline – saved content is used.', 'Öffne eine .osr-Datei von deinem Gerät (oder zieh sie hierher). Beatmap und Ton werden online geladen.': 'Open an .osr file from your device (or drop it here). Beatmap and audio are loaded online.', 'Scores und Maps jedes Spielers ansehen, ohne Anmeldung. Replays von osu!-Servern brauchen die Anmeldung.': 'View scores and maps of any player without login. Replays from osu! servers need a login.', 'nicominecith osu! direkt starten': 'Start nicominecith osu! directly', 'Eigenen Skin importieren, HUD, Cursor und Ton': 'Import your own skin, HUD, cursor and sound', 'Kurz erklärt, was die Seite kann': 'A quick tour of what this site can do', 'Video-Fehler': 'Video error', 'Position': 'Position', 'Mehr': 'More' };
  Object.assign(EN, {"+ Skin importieren (.osk)": "+ Import skin (.osk)", "Alles zurücksetzen": "Reset everything", "Cursor-Trail": "Cursor trail", "Cursor-Größe": "Cursor size", "Das Replay läuft mit Score, Genauigkeit und Combo. Du kannst spulen und das Tempo ändern.": "The replay plays with score, accuracy and combo. You can seek and change the speed.", "Die Anmeldung ist freiwillig. Meldest du dich an, bekommen wir nur dein öffentliches Profil und deine Scores – nie dein Passwort.": "Login is optional. If you sign in, we only get your public profile and scores – never your password.", "Die Seite lässt sich installieren und startet auch ohne Internet. Replays brauchen für Beatmap und Ton einmal Verbindung.": "The site can be installed and starts without internet. Replays need a connection once for beatmap and audio.", "Dieses Tutorial findest du später wieder auf dem Login-Screen oder in den Einstellungen.": "You can find this tutorial again later on the login screen or in the settings.", "Du bist schon angemeldet – viel Spaß mit deinen Replays!": "You are already signed in – enjoy your replays!", "Du kannst die Seite": "You can use the site", "Galerie durchsuchen": "Search gallery", "Gebaut von": "Built by", "HUD (Health, Score, Combo, Accuracy)": "HUD (health, score, combo, accuracy)", "Hier schaust du dir osu!-Replays direkt im Browser an – auf Handy, Tablet und PC, ohne etwas zu installieren.": "Watch osu! replays right in your browser – on phone, tablet and PC, nothing to install.", "Hintergrund abdunkeln": "Dim background", "Hintergrundbild": "Background image", "Hinweis": "Note", "Hitsounds": "Hitsounds", "Inoffiziell: Die Seite gehört nicht zu osu! oder ppy und wird nicht von ihnen betrieben.": "Unofficial: this site is not part of osu! or ppy and not run by them.", "Lade Skins…": "Loading skins…", "Live-Ansicht": "Live view", "Live-Ansicht · Ton": "Live view · Sound", "Los geht’s!": "Let’s go!", "Mit Anmeldung zusätzlich:": "With login, additionally:", "Mods wie HR, DT und TC werden mit abgespielt.": "Mods like HR, DT and TC are played too.", "Offline:": "Offline:", "Ohne Anmeldung:": "Without login:", "Replay öffnen: entweder deine Plays nach der Anmeldung antippen oder eine .osr-Datei öffnen.": "Open a replay: tap your plays after logging in, or open an .osr file.", "Skin-Galerie (500) · .osk oder .zip": "Skin gallery (500) · .osk or .zip", "Slider-Ticks anzeigen": "Show slider ticks", "Standard": "Default", "Start-Geschwindigkeit": "Start speed", "Tippen zum Aktivieren": "Tap to activate", "Tutorial anzeigen": "Show tutorial", "Von wem ist die Seite?": "Who made this site?", "Was du hier machen kannst": "What you can do here", "Was macht die Seite?": "What does the site do?", "Wie möchtest du starten?": "How do you want to start?", "Willkommen bei Osu Replay": "Welcome to Osu Replay", "als kostenloses Fan-Projekt.": "as a free fan project.", "deine letzten und besten Plays, Spieler suchen und die Skin-Galerie mit bis zu 500 Skins.": "your recent and best plays, player search and the skin gallery with up to 500 skins.", "eigene .osr-Replays öffnen, „▶ Spielen\" mit nicominecith osu!, eigene Skins importieren und die Einstellungen nutzen.": "open your own .osr replays, “▶ Play” with nicominecith osu!, import your own skins and use the settings.", "ganz ohne Anmeldung": "entirely without login.", "mit osu!-Anmeldung": "with osu! login", "nutzen. Die nächsten Schritte zeigen kurz, was geht.": "The next steps briefly show what’s possible.", "ohne Skin": "no skin", "Änderungen werden sofort gespeichert.": "Changes are saved immediately.", " (eher zu früh)": " (rather early)", " (eher zu spät)": " (rather late)", " Skins · für die Galerie bitte mit osu! anmelden": " skins · sign in with osu! for the gallery", "Abmelden": "Log out", "Abspielen oder pausieren": "Play or pause", "Aktuell wird nur osu!standard unterstützt.": "Only osu!standard is supported right now.", "Beatmap konnte nicht geladen werden.": "Beatmap could not be loaded.", "Beste Plays": "Best plays", "Bitte eine .osr-Replay-Datei wählen.": "Please choose an .osr replay file.", "Bitte mit osu! anmelden": "Please sign in with osu!", "Das Video konnte nicht dekodiert werden.": "The video could not be decoded.", "Das Video konnte nicht geladen werden. Der Link ist eventuell abgelaufen oder keine direkte Videodatei.": "The video could not be loaded. The link may have expired or is not a direct video file.", "Datei zu groß": "File too large", "Deine Replays,": "Your replays,", "Deine eigenen Plays, die Skin-Galerie und das Ansehen von Replays anderer Spieler brauchen eine Anmeldung mit osu! (osu! gibt Replays nur an angemeldete Nutzer heraus). Replay-Dateien (.osr) und alles andere gehen auch ohne.": "Your own plays, the skin gallery and watching other players’ replays need an osu! login (osu! only gives replays to signed-in users). Replay files (.osr) and everything else work without it.", "Die Beatmap zu diesem Replay wurde nicht gefunden.": "The beatmap for this replay was not found.", "Die Galerie braucht eine Anmeldung mit osu!.": "The gallery needs an osu! login.", "Die Replay-Datei ist zu groß (max. 8 MB).": "The replay file is too large (max. 8 MB).", "Die Replay-Datei konnte nicht gelesen werden.": "The replay file could not be read.", "Eigene Skins &amp; Galerie": "Own skins & gallery", "Eigener osu!-Skin (.osk)": "Custom osu! skin (.osk)", "Fehler: ": "Error: ", "Für den Import aus dem Account ist die osu!-Anmeldung nötig. Du kannst stattdessen .osz-Dateien wählen.": "Importing from your account requires an osu! login. You can choose .osz files instead.", "Für diesen Replay-Download ist die osu!-Anmeldung nötig.": "This replay download requires an osu! login.", "Geschwindigkeit": "Speed", "Geschwindigkeit zurücksetzen": "Reset speed", "Hitsound-Lautstärke": "Hitsound volume", "Kein Ton: Beatmap-Audio nicht erreichbar. Tippe hier für einen neuen Versuch.": "No sound: beatmap audio unreachable. Tap here to try again.", "Keine Skin-Datei": "No skin file", "Lade Mapliste…": "Loading map list…", "Lade Scores…": "Loading scores…", "Lade…": "Loading…", "Lautstärke": "Volume", "Lese Replay…": "Reading replay…", "Längste Combo": "Longest combo", "Map- &amp; Score-Details": "Map & score details", "Mapliste konnte nicht geladen werden. Bitte später erneut versuchen.": "Map list could not be loaded. Please try again later.", "Mehr laden": "Load more", "Mit osu! anmelden": "Sign in with osu!", "Musik-Lautstärke": "Music volume", "Offline – diese Scores sind noch nicht gespeichert.": "Offline – these scores are not saved yet.", "Offline: Die Beatmap zu diesem Replay ist noch nicht gespeichert.": "Offline: the beatmap for this replay is not saved yet.", "Replay": "Replay", "Replay ansehen (Anmeldung nötig)": "Watch replay (login required)", "Replay konnte nicht gelesen werden.": "Replay could not be read.", "Replays direkt im Browser": "Replays right in your browser", "Score, Genauigkeit &amp; Combo live": "Score, accuracy & combo live", "Scores durchsuchen": "Search scores", "Selbst spielen mit nicominecith osu!": "Play yourself with nicominecith osu!", "Skin": "Skin", "Skin ist zu groß": "Skin is too large", "Skin-Datei fehlt": "Skin file missing", "Skin-Server antwortet nicht": "Skin server not responding", "Skin-Sync zum Spiel fehlgeschlagen": "Skin sync to the game failed", "Spieler suchen (Name)…": "Search player (name)…", "Suchen": "Search", "Titel, Artist, Mapper oder Difficulty suchen": "Search title, artist, mapper or difficulty", "Ton an oder aus": "Sound on or off", "Ton konnte nicht gestartet werden – das Replay läuft ohne Musik.": "Sound could not be started – the replay runs without music.", "Tutorial schließen": "Close tutorial", "Verbinde dein osu!-Konto und schau dir deine letzten und besten Plays auf Handy, Tablet oder PC an.": "Connect your osu! account and watch your recent and best plays on phone, tablet or PC.", "Video öffnen oder herunterladen": "Open or download video", "Vollbild": "Fullscreen", "Wie funktioniert das? · Kurze Einführung": "How does it work? · Quick intro", "Wiedergabe-Geschwindigkeit": "Playback speed", "Wir bekommen nur dein öffentliches Profil und deine Scores – nie dein Passwort.": "We only get your public profile and scores – never your password.", "Zeitleiste": "Timeline", "Zuletzt gespielt": "Recently played", "nur mit Replay": "replay only", "osr-zu-gross": "Replay file too large", "zip-zu-gross": "ZIP too large", "zip-zu-viele-dateien": "ZIP has too many files", "osu! gibt Replays nur an angemeldete Nutzer heraus. Melde dich an oder öffne eine .osr-Datei.": "osu! only gives replays to signed-in users. Sign in or open an .osr file.", "osu!-Replays · kostenlos": "osu! replays · free", "überall.": "anywhere.", "← Start": "← Home", "← Zurück zu mir": "← Back to me", "▶ Spielen": "▶ Play", "Deine Plays": "Your plays", "Letzte Plays": "Recent plays"});
  const orig = new WeakMap(), ATTR = ['aria-label', 'title', 'placeholder'];
  function tr(node) {
    if (node.nodeType === 3) { const s = node.nodeValue, k = s.trim(); if (!k) return; if (!orig.has(node)) { if (!EN[k]) return; orig.set(node, s); } const o = orig.get(node), ok = o.trim(); node.nodeValue = lang === 'en' && EN[ok] ? o.replace(ok, EN[ok]) : o; return; }
    if (node.nodeType !== 1 || /^(SCRIPT|STYLE|TEXTAREA)$/.test(node.tagName) || node.id === 'xHub') return;
    for (const a of ATTR) { const v = node.getAttribute(a); if (v == null) continue; const key = '_o' + a; if (!node[key]) { if (!EN[v]) continue; node[key] = v; } node.setAttribute(a, lang === 'en' && EN[node[key]] ? EN[node[key]] : node[key]); }
    node.childNodes.forEach(tr);
  }
  let trT = 0; const translate = () => { document.documentElement.lang = lang; tr(document.body); };
  new MutationObserver(() => { clearTimeout(trT); trT = setTimeout(() => { if (lang === 'en') translate(); hint(); }, 200); }).observe(document.body, { childList: true, subtree: true });

  /* ---------- Link-Parameter (49) ---------- */
  function fromUrl() { const p = new URLSearchParams(location.search), s = p.get('score'); if (s && /^\d+$/.test(s)) setTimeout(() => quickImport('https://osu.ppy.sh/scores/' + s), 1800); }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && X.stats) SHORT.st(); });

  /* ---------- Erststart: Sprachauswahl (Standard Englisch) ---------- */
  if (firstRun) {
    const lo = el('div', { id: 'xLang', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Language' }, '<div class="xl-box"><div class="xl-ic">🌐</div><h2>Choose your language</h2><p>Sprache wählen</p><button type="button" class="btn" data-l="en">English</button><button type="button" class="btn alt" data-l="de">Deutsch</button></div>');
    lo.addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (!b) return; lang = b.dataset.l; ls.set('osuLang', lang); translate(); dropTxt(); btnTitles(); lo.remove(); });
    document.body.append(lo); lo.querySelector('button').focus();
  }

  /* ---------- Start ---------- */
  applyLite(); hint(); dropTxt(); btnTitles(); if (lang === 'en') translate(); requestAnimationFrame(loop); fromUrl();
  window.xExtras = { toast, quickImport, openSheet, version: VER };
})();
