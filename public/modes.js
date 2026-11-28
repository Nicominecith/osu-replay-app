/* Modi: osu!taiko, osu!catch, osu!mania – Parser, Auswertung (aus Replay-Eingaben geschätzt) und Darstellung */
(() => {
  'use strict';
  const NAMES = ['osu!standard', 'osu!taiko', 'osu!catch', 'osu!mania'], API = ['osu', 'taiko', 'fruits', 'mania'];
  const dr = (d, a, b, c) => (d > 5 ? b + (c - b) * (d - 5) / 5 : d < 5 ? b - (b - a) * (5 - d) / 5 : b);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fAt = (F, t) => { let l = 0, r = F.length - 1; while (l < r) { const m = (l + r + 1) >> 1; F[m].t <= t ? l = m : r = m - 1; } return F[l]; };
  const raw = txt => { const o = []; let sec = ''; for (let l of txt.split('\n')) { l = l.trim(); if (!l || l.startsWith('//')) continue; if (l[0] === '[') { sec = l; continue; } if (sec === '[HitObjects]') { const a = l.split(','); o.push({ x: +a[0], y: +a[1], t: +a[2], ty: +a[3], hs: +a[4] | 0, a }); } } return o; };

  /* ---------- Taiko ---------- */
  const taikoObjs = (rw, base) => rw.map((r, i) => { const b = base.ho[i] || {}, big = !!(r.hs & 4); if (r.ty & 8) return { t: r.t, end: +r.a[5] || r.t, k: 'swell', type: 0 }; if (r.ty & 2) return { t: r.t, end: b.end || r.t, k: 'roll', big, type: 0 }; return { t: r.t, end: r.t, k: r.hs & 10 ? 'kat' : 'don', big, type: 0 }; });
  function taikoPresses(F) { const P = []; let pk = 0; for (const f of F) { const nb = f.k & ~pk; if (nb & 5) P.push({ t: f.t, kind: 'don' }); if (nb & 10) P.push({ t: f.t, kind: 'kat' }); pk = f.k; } return P; }
  function judgeTaiko(O, F, od, bits) {
    if (bits & 16) od = Math.min(10, od * 1.4); if (bits & 2) od /= 2;
    const gw = dr(od, 50, 35, 20), ow = dr(od, 120, 80, 50), mw = dr(od, 135, 95, 70), C = O.filter(o => o.k === 'don' || o.k === 'kat'), P = taikoPresses(F), J = [], E = [];
    const done = (o, res, ht) => { o.res = res; o.hitT = ht; J.push({ jt: ht ?? o.t + mw, res, pts: res === 3 ? 1 : res === 2 ? .5 : 0, mx: 1, brk: res === 0, txt: ['MISS', '', 'OK', 'GREAT'][res] }); if (ht != null && res > 0) E.push(ht - o.t); };
    let p = 0, skip = null;
    for (const pr of P) {
      if (skip && pr.kind === skip.kind && pr.t - skip.t <= 35) { skip = null; continue; } skip = null;
      while (p < C.length && C[p].t + mw < pr.t) done(C[p++], 0, null);
      if (p >= C.length) break;
      const o = C[p], d = pr.t - o.t; if (d < -mw) continue;
      if (pr.kind === o.k && Math.abs(d) <= ow) done(o, Math.abs(d) <= gw ? 3 : 2, pr.t); else done(o, 0, null);
      if (o.big) skip = { kind: pr.kind, t: pr.t }; p++;
    }
    while (p < C.length) done(C[p++], 0, null);
    for (const o of O) if (o.k === 'roll' || o.k === 'swell') o.hits = P.filter(x => x.t >= o.t && x.t <= o.end).length;
    return { J, E };
  }

  /* ---------- Mania ---------- */
  function maniaObjs(rw, keys) { return rw.map(r => { const col = clamp(Math.floor(r.x * keys / 512), 0, keys - 1); return r.ty & 128 ? { t: r.t, end: Math.max(r.t, parseInt(r.a[5], 10) || r.t), k: 'hold', col, type: 0 } : { t: r.t, end: r.t, k: 'note', col, type: 0 }; }); }
  function judgeMania(O, F, keys, od) {
    const w = [16.5, 64 - 3 * od, 97 - 3 * od, 127 - 3 * od, 151 - 3 * od, 188 - 3 * od], J = [], E = [], cols = Array.from({ length: keys }, () => ({ pr: [], rl: [] }));
    let pm = 0; for (const f of F) { const m = f.x | 0, nb = m & ~pm, rb = pm & ~m; for (let c = 0; c < keys; c++) { if (nb >> c & 1) cols[c].pr.push(f.t); if (rb >> c & 1) cols[c].rl.push(f.t); } pm = m; }
    const lv = ad => (ad <= w[0] ? [3, 305, 'MAX'] : ad <= w[1] ? [3, 300, '300'] : ad <= w[2] ? [2, 200, '200'] : ad <= w[3] ? [2, 100, '100'] : [1, 50, '50']);
    const add = (jt, r, pts, txt) => J.push({ jt, res: r, pts, mx: 305, brk: r === 0, txt });
    const tail = (o, from) => { const rl = cols[o.col].rl.find(x => x >= from), tw = w[3] * 1.5; if (rl == null) { o.tres = 0; o.relT = null; add(o.end, 0, 0, 'MISS'); return; } o.relT = rl; const ad = Math.abs(rl - o.end); const r = rl < o.end - tw ? 0 : ad <= w[1] * 1.5 ? 3 : 2; o.tres = r; add(Math.max(rl, o.end), r, r === 3 ? 300 : r === 2 ? 100 : 0, r ? (r === 3 ? '300' : '100') : 'MISS'); };
    for (let c = 0; c < keys; c++) {
      const N = O.filter(o => o.col === c).sort((a, b) => a.t - b.t); let p = 0;
      const miss = o => { o.res = 0; o.hitT = null; add(o.t + w[5], 0, 0, 'MISS'); if (o.k === 'hold') { o.tres = 0; add(o.end + w[5], 0, 0, 'MISS'); } };
      for (const pt of cols[c].pr) {
        while (p < N.length && N[p].t + w[5] < pt) miss(N[p++]);
        if (p >= N.length) break;
        const o = N[p], d = pt - o.t; if (d < -w[5]) continue;
        const [r, pts, tx] = lv(Math.abs(d)); o.res = r; o.hitT = pt; E.push(d); add(pt, r, pts, tx); if (o.k === 'hold') tail(o, pt); p++;
      }
      while (p < N.length) miss(N[p++]);
    }
    return { J, E };
  }

  /* ---------- Catch ---------- */
  function catchObjs(rw, base, H) {
    const out = [], d = base.d, TR = d.SliderTickRate || 1, SM = d.SliderMultiplier || 1.4;
    rw.forEach((r, i) => {
      const b = base.ho[i]; if (r.ty & 8) return;
      if ((r.ty & 2) && b && b.pts) {
        H.buildPath(b); out.push({ t: b.t, end: b.t, k: 'fruit', x: r.x, type: 0 });
        if (!b.path || !b.d) return;
        const span = (b.end - b.t) / b.slides, tp = SM * 100 / TR, n = Math.min(200, Math.floor(b.len / tp));
        for (let s = 0; s < b.slides; s++) {
          for (let j = 1; j <= n; j++) { const f = j * tp / b.len; if (f >= 1) break; out.push({ t: b.t + s * span + (s % 2 ? 1 - f : f) * span, end: 0, k: 'drop', x: H.posAt(b, f)[0], type: 0 }); }
          out.push({ t: b.t + (s + 1) * span, end: 0, k: 'fruit', x: H.posAt(b, s % 2 ? 0 : 1)[0], type: 0 });
        }
      } else out.push({ t: r.t, end: r.t, k: 'fruit', x: r.x, type: 0 });
    });
    for (const o of out) { o.end = o.t; o.x = clamp(o.x, 0, 512); }
    return out.sort((a, b) => a.t - b.t);
  }
  const catchW = cs => 106.75 * ((1 - .7 * (cs - 5) / 5) / 2);
  function judgeCatch(O, F, cs) {
    const half = catchW(cs) * .8 / 2, J = [], cx = t => { let l = 0, r = F.length - 1; while (l < r) { const m = (l + r + 1) >> 1; F[m].t <= t ? l = m : r = m - 1; } const a = F[l], b = F[Math.min(F.length - 1, l + 1)]; return b.t > a.t && t > a.t ? a.x + (b.x - a.x) * Math.min(1, (t - a.t) / (b.t - a.t)) : a.x; };
    for (const o of O) { const ok = Math.abs(cx(o.t) - o.x) <= half; o.res = ok ? (o.k === 'fruit' ? 3 : 2) : 0; o.hitT = ok ? o.t : null; J.push({ jt: o.t, res: o.res, pts: ok ? 1 : 0, mx: 1, brk: !ok && o.k === 'fruit', txt: ok ? '' : 'MISS' }); }
    return { J, E: [] };
  }

  /* ---------- Gemeinsamer Abschluss ---------- */
  function finish(base, mode, O, r, rate) {
    const J = r.J.sort((a, b) => a.jt - b.jt), ev = []; let c = 0, mx = 0, got = 0, tot = 0, h = 1; const st = { n3: 0, n1: 0, n5: 0, miss: 0 };
    for (const j of J) { j.brk ? c = 0 : j.res > 0 && c++; mx = Math.max(mx, c); got += j.pts; tot += j.mx; h = clamp(h + (j.res ? .02 : -.1), 0, 1); st[j.res === 3 ? 'n3' : j.res === 2 ? 'n1' : j.res === 1 ? 'n5' : 'miss']++; j.c = c; ev.push({ t: j.jt, a: tot ? got / tot : 1, c, h }); }
    const E = r.E, avg = E.length ? E.reduce((a, b) => a + b, 0) / E.length : 0, sd = E.length ? Math.sqrt(E.reduce((a, b) => a + (b - avg) ** 2, 0) / E.length) : 0;
    base.mode = mode; base.ho = O; base.ev = ev; base.jl = J; base.r = 0; base.stats = { ...st, mx, cb: 0, sb: 0, mh: 1, ur: sd * 10 / (rate || 1), avg: avg / (rate || 1) };
    return base;
  }
  function build(mode, txt, F, mi, H) {
    const base = H.parseMap(txt, 0), rw = raw(txt), d = base.d, bits = mi.bits | 0; base.speed = mi.speed; base.tc = mi.tc;
    if (!rw.length) throw new Error('map');
    if (mode === 1) { base.sm = d.SliderMultiplier || 1.4; const O = taikoObjs(rw, base); return finish(base, 1, O, judgeTaiko(O, F, d.OverallDifficulty ?? 5, bits), mi.speed); }
    if (mode === 3) { const keys = clamp(Math.round(d.CircleSize || 4), 1, 18); base.keys = keys; const O = maniaObjs(rw, keys); return finish(base, 3, O, judgeMania(O, F, keys, d.OverallDifficulty ?? 5), mi.speed); }
    let cs = d.CircleSize ?? 5, ar = d.ApproachRate ?? d.OverallDifficulty ?? 5; if (bits & 16) { cs = Math.min(10, cs * 1.3); ar = Math.min(10, ar * 1.4); } if (bits & 2) { cs /= 2; ar /= 2; }
    base.cs = cs; base.pre = ar < 5 ? 1200 + 600 * (5 - ar) / 5 : 1200 - 750 * (ar - 5) / 5; const O = catchObjs(rw, base, H); return finish(base, 2, O, judgeCatch(O, F, cs), mi.speed);
  }
  const core = { build, NAMES, API, judgeTaiko, judgeMania, judgeCatch, taikoPresses, raw };
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;

  /* ---------- Modus-Umschalter (Scores) ---------- */
  const q = s => document.querySelector(s), SPD = [.35, .5, .7, .9, 1.2, 1.6];
  const L = () => { try { return localStorage.getItem('osuLang') === 'de' ? 'de' : 'en'; } catch { return 'en'; } };
  const T = (d, e) => (L() === 'en' ? e : d);
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : +v; } catch { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  window.xMode = clamp(get('osuMode', 0) | 0, 0, 3); window.xmApi = () => API[window.xMode | 0];
  const sw = document.createElement('div'); sw.id = 'xMode'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Modus / Mode');
  sw.innerHTML = ['osu!', 'taiko', 'catch', 'mania'].map((n, i) => `<button type="button" data-m="${i}" aria-pressed="${i === window.xMode}" title="${NAMES[i]}">${n}</button>`).join('');
  const tabs = q('#app .tabs'); if (tabs) tabs.before(sw);
  sw.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; window.xMode = +b.dataset.m; put('osuMode', window.xMode); sw.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); if (typeof load === 'function') load(true); });

  /* ---------- Darstellung ---------- */
  let si = clamp(get('osuScroll', 2) | 0, 0, SPD.length - 1);
  const spd = () => SPD[si];
  const bg = () => { g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 960, 720); g.globalAlpha = 1; if (S.bg && bgImg && bgImg.naturalWidth) { const k = Math.max(960 / bgImg.naturalWidth, 720 / bgImg.naturalHeight), w = bgImg.naturalWidth * k, hh = bgImg.naturalHeight * k; g.globalAlpha = 1 - S.dim / 100; g.drawImage(bgImg, (960 - w) / 2, (720 - hh) / 2, w, hh); g.globalAlpha = 1; } g.fillStyle = 'rgba(8,6,20,.35)'; g.fillRect(0, 0, 960, 720); g.textAlign = 'center'; g.textBaseline = 'middle'; };
  const evAt = (m, t) => { const ev = m.ev; if (!ev.length || ev[0].t > t) return null; let l = 0, r = ev.length - 1; while (l < r) { const k = (l + r + 1) >> 1; ev[k].t <= t ? l = k : r = k - 1; } return ev[l]; };
  const lastJ = (m, t) => { const J = m.jl; let l = 0, r = J.length - 1; if (!J.length || J[0].jt > t) return null; while (l < r) { const k = (l + r + 1) >> 1; J[k].jt <= t ? l = k : r = k - 1; } return J[l]; };
  const JC = ['#ff4d6d', '#ffd166', '#7de3d0', '#6ea8ff'];
  function hud(m, t) {
    const e = evAt(m, t), a = e ? e.a : 1, c = e ? e.c : 0;
    g.font = '700 22px system-ui'; g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText((a * 100).toFixed(2) + '%', 940, 30);
    g.textAlign = 'left'; g.font = '600 16px system-ui'; g.fillStyle = '#ffffffcc'; g.fillText(NAMES[m.mode], 20, 30);
    g.font = '800 40px system-ui'; g.fillText(c + 'x', 20, 690);
    const j = lastJ(m, t); if (j && j.txt && t - j.jt < 450 && t >= j.jt) { g.globalAlpha = 1 - (t - j.jt) / 450; g.textAlign = 'center'; g.font = '800 30px system-ui'; g.fillStyle = JC[j.res]; g.fillText(j.txt, m.mode === 3 ? 480 : m.mode === 1 ? 200 : 480, m.mode === 1 ? 290 : 400); g.globalAlpha = 1; }
  }
  function taiko(m, t) {
    const y = 380, hx = 200, sp = m.sm * .22 * spd() / .7, f = fAt(F, t);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, y - 70, 960, 140); g.fillStyle = 'rgba(20,16,40,.9)'; g.fillRect(0, y - 70, 130, 140);
    g.strokeStyle = '#ffffffaa'; g.lineWidth = 4; g.beginPath(); g.arc(hx, y, 40, 0, 7); g.stroke();
    for (const o of m.ho) {
      const x = hx + (o.t - t) * sp, xe = hx + (o.end - t) * sp; if (x > 1040) break; if (xe < 100) continue;
      if (o.k === 'roll') { g.fillStyle = '#ffd16688'; g.strokeStyle = '#ffd166'; g.lineWidth = 3; const hh = o.big ? 64 : 44; g.beginPath(); g.roundRect(Math.max(x, 130), y - hh / 2, Math.max(10, xe - Math.max(x, 130)), hh, hh / 2); g.fill(); g.stroke(); continue; }
      if (o.k === 'swell') { const sx = Math.max(x, hx); g.fillStyle = '#ff9f4a'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(sx, y, 48, 0, 7); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.font = '800 22px system-ui'; g.fillText(o.hits || 0, sx, y); continue; }
      if (o.res > 0 && t >= o.hitT) { const dt = t - o.hitT; if (dt < 200) { g.strokeStyle = '#fff'; g.globalAlpha = 1 - dt / 200; g.lineWidth = 4; g.beginPath(); g.arc(hx, y, 40 + dt / 5, 0, 7); g.stroke(); g.globalAlpha = 1; } continue; }
      if (x < 120) continue;
      g.globalAlpha = o.res === 0 && t > o.t ? .35 : 1; g.fillStyle = o.k === 'don' ? '#ec4b4b' : '#4b9bec'; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, o.big ? 42 : 30, 0, 7); g.fill(); g.stroke(); g.globalAlpha = 1;
    }
    const k = f.k, P = Math.PI; g.fillStyle = '#2a2442'; g.beginPath(); g.arc(66, y, 54, 0, 7); g.fill();
    g.lineWidth = 14; for (const [bit, a0, a1, col] of [[2, P / 2, P * 1.5, '#4b9bec'], [8, -P / 2, P / 2, '#4b9bec']]) { g.strokeStyle = k & bit ? col : '#4b9bec44'; g.beginPath(); g.arc(66, y, 47, a0, a1); g.stroke(); }
    for (const [bit, a0, a1] of [[1, P / 2, P * 1.5], [4, -P / 2, P / 2]]) { g.fillStyle = k & bit ? '#ec4b4b' : '#ec4b4b44'; g.beginPath(); g.arc(66, y, 34, a0, a1); g.fill(); }
  }
  function mania(m, t) {
    const K = m.keys, lw = Math.min(78, 700 / K) | 0, x0 = (960 - lw * K) / 2, JL = 600, sp = spd(), msk = fAt(F, t).x | 0;
    g.fillStyle = 'rgba(0,0,0,.62)'; g.fillRect(x0, 0, lw * K, 720);
    for (let c = 0; c < K; c++) { if (msk >> c & 1) { const gr = g.createLinearGradient(0, JL - 260, 0, JL); gr.addColorStop(0, 'rgba(125,227,208,0)'); gr.addColorStop(1, 'rgba(125,227,208,.38)'); g.fillStyle = gr; g.fillRect(x0 + c * lw, JL - 260, lw, 260); } g.fillStyle = '#ffffff14'; g.fillRect(x0 + c * lw, 0, 1, 720); }
    g.fillRect(x0 + K * lw, 0, 1, 720); g.fillStyle = '#ff5fa2'; g.fillRect(x0, JL, lw * K, 5);
    const col = c => (K % 2 && c === (K - 1) / 2 ? '#ffd166' : Math.min(c, K - 1 - c) % 2 ? '#6ea8ff' : '#e8e8ff');
    for (const o of m.ho) {
      const yh = JL - (o.t - t) * sp; if (yh < -90) break; const yt = JL - (o.end - t) * sp, x = x0 + o.col * lw;
      if (o.k === 'hold') {
        if (o.tres != null && t >= (o.relT ?? o.end)) continue; const held = o.res > 0 && t >= o.hitT, hy = held ? Math.min(JL, yh) : yh; if (hy < -90 && yt < -90) continue;
        g.globalAlpha = o.res === 0 && t > o.t ? .3 : .55; g.fillStyle = col(o.col); g.fillRect(x + lw * .2, yt, lw * .6, hy - yt); g.globalAlpha = o.res === 0 && t > o.t ? .3 : 1; g.beginPath(); g.roundRect(x + 3, hy - 13, lw - 6, 26, 6); g.fill(); g.globalAlpha = 1; continue;
      }
      if (o.res > 0 && t >= o.hitT) continue; if (yh > 760) continue;
      g.globalAlpha = o.res === 0 && t > o.t ? .3 : 1; g.fillStyle = col(o.col); g.beginPath(); g.roundRect(x + 3, yh - 13, lw - 6, 26, 6); g.fill(); g.globalAlpha = 1;
    }
  }
  function catcher(m, t) {
    const sx = x => 96 + x * 1.5, CY = 620, pre = m.pre, rr = (54.4 - 4.48 * m.cs) * .55, f = fAt(F, t), nx = F[Math.min(F.length - 1, F.indexOf(f) + 1)], cx = nx.t > f.t && t > f.t ? f.x + (nx.x - f.x) * Math.min(1, (t - f.t) / (nx.t - f.t)) : f.x;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(96, 0, 768, 720);
    const pal = ['#ff5fa2', '#7de3d0', '#ffd166', '#a78bfa'];
    for (const o of m.ho) {
      const dt = o.t - t; if (dt > pre) break; if (dt < -400) continue; const caught = o.res > 0 && t >= o.t; if (caught) continue;
      const y = CY - dt / pre * (CY - 40); if (y > 700) continue; g.globalAlpha = o.res === 0 && dt < 0 ? .35 : 1;
      g.fillStyle = o.k === 'fruit' ? pal[(o.t / 1000 | 0) % 4] : '#8fd3ff'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(sx(o.x), y, o.k === 'fruit' ? rr * 1.5 : rr * .7, 0, 7); g.fill(); if (o.k === 'fruit') g.stroke(); g.globalAlpha = 1;
    }
    const w = catchW(m.cs) * 1.5; g.fillStyle = f.k & 1 ? '#ffd166' : '#fff'; g.beginPath(); g.roundRect(sx(cx) - w / 2, CY, w, 16, 8); g.fill(); g.beginPath(); g.arc(sx(cx), CY - 8, 14, 0, 7); g.fill();
  }
  window.xmDraw = t => { const m = M; bg(); m.mode === 1 ? taiko(m, t) : m.mode === 3 ? mania(m, t) : catcher(m, t); hud(m, t); };
  window.xmBuild = (mode, txt, F2, mi) => { const m = build(mode, txt, F2, mi, { parseMap, buildPath, posAt, slideFrac }); const ti = q('#title'); if (ti) ti.textContent += ' · ' + NAMES[mode]; return m; };

  /* ---------- Scroll-Geschwindigkeit + Modus-abhängige UI ---------- */
  setInterval(() => {
    const alt = typeof M !== 'undefined' && M && M.mode > 0; document.body.classList.toggle('xm-alt', !!alt);
    const bar = q('#xBar'); if (!bar) return; let b = bar.querySelector('[data-xm=sc]');
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'xb'; b.dataset.xm = 'sc'; b.addEventListener('click', () => { si = (si + 1) % SPD.length; put('osuScroll', si); b.textContent = '⏩' + SPD[si]; }); bar.append(b); }
    b.hidden = !(alt && M.mode !== 2); b.textContent = '⏩' + SPD[si]; b.title = b.ariaLabel = T('Scroll-Geschwindigkeit', 'Scroll speed');
  }, 400);
})();
