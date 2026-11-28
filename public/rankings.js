/* Ranglisten: Top 100 Spieler je Modus (osu!, taiko, catch, mania) nach pp oder Punkten (Ranked Score), wie in osu! lazer */
(() => {
  'use strict';
  const MODES = [['osu', 'osu!'], ['taiko', 'taiko'], ['fruits', 'catch'], ['mania', 'mania']];
  const lang = () => (document.documentElement.lang || localStorage.getItem('osuLang') || 'en').slice(0, 2);
  const T = (d, e) => (lang() === 'de' ? d : e);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = n => Math.round(+n || 0).toLocaleString(lang() === 'de' ? 'de-DE' : 'en-US');
  const css = document.createElement('style');
  css.textContent = `
#rankView{position:fixed;inset:0;z-index:70;background:var(--bg);overflow:auto;padding:max(12px,env(safe-area-inset-top)) 0 max(12px,env(safe-area-inset-bottom))}
#rankView .rw{max-width:900px;margin:0 auto;padding:0 14px}
#rankView .rh{display:flex;align-items:center;gap:10px;margin-bottom:12px}#rankView .rh h2{margin:0;font-size:1.25rem;flex:1}
#rankView .rt{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
#rankView .rt button{background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:7px 14px;color:var(--dim)}
#rankView .rt button[aria-pressed=true]{background:var(--pink);border-color:var(--pink);color:#fff}
#rankView .rr{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:8px 12px;border:1px solid var(--line);background:var(--panel);border-radius:12px;margin-bottom:6px}
#rankView .rr:nth-child(-n+3) .rn{color:var(--mint);font-weight:700}
#rankView .rn{text-align:center;color:var(--dim)}
#rankView .ru{display:flex;align-items:center;gap:10px;min-width:0}
#rankView .ru img{width:34px;height:34px;border-radius:8px;object-fit:cover;background:var(--line);flex:none}
#rankView .ru b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#rankView .ru small,#rankView .rv small{color:var(--dim);display:block}
#rankView .rv{text-align:right;font-variant-numeric:tabular-nums}#rankView .rv b{color:var(--mint)}
#rankView .rm{color:var(--dim);padding:24px 0;text-align:center}
@media(max-width:520px){#rankView .rr{grid-template-columns:34px 1fr auto;padding:7px 9px}}`;
  document.head.appendChild(css);
  const v = document.createElement('section');
  v.id = 'rankView'; v.hidden = true; v.setAttribute('role', 'dialog'); v.setAttribute('aria-label', 'Ranglisten');
  v.innerHTML = '<div class="rw"><div class="rh"><button class="ghost" id="rkBack" type="button"></button><h2 id="rkTitle"></h2><button class="ghost" id="rkReload" type="button">↻</button></div><div class="rt" id="rkModes"></div><div class="rt" id="rkType"></div><div id="rkList"></div></div>';
  document.body.appendChild(v);
  const $ = s => v.querySelector(s);
  let mode = 0, type = 'performance', tok = 0;
  const cache = new Map(); // Schlüssel -> { t, rows }
  const page = async (m, ty, p) => {
    const r = await fetch('/api/osu?' + new URLSearchParams({ path: `/rankings/${m}/${ty}`, 'cursor[page]': p }), { credentials: 'same-origin' });
    if (!r.ok) throw new Error(r.status === 429 ? 'rate' : 'http');
    return (await r.json()).ranking || [];
  };
  function paint(rows) {
    const pp = type === 'performance';
    $('#rkList').innerHTML = rows.map((x, i) => {
      const u = x.user || {}, main = pp ? nf(x.pp) + ' pp' : nf(x.ranked_score), sub = pp ? nf(x.ranked_score) + ' ' + T('Punkte', 'score') : nf(x.pp) + ' pp';
      return `<div class="rr"><div class="rn">#${i + 1}</div><div class="ru">${u.avatar_url ? `<img loading="lazy" decoding="async" alt="" src="${esc(u.avatar_url)}">` : '<img alt="">'}<div style="min-width:0"><b>${esc(u.username)}</b><small>${esc(u.country_code || '')} · ${(+x.hit_accuracy || 0).toFixed(2)}% · ${nf(x.play_count)} ${T('Plays', 'plays')}</small></div></div><div class="rv"><b>${main}</b><small>${sub}</small></div></div>`;
    }).join('') || `<div class="rm">${T('Keine Daten.', 'No data.')}</div>`;
  }
  async function load(force) {
    const my = ++tok, key = MODES[mode][0] + type, hit = cache.get(key);
    $('#rkTitle').textContent = T('Ranglisten · Top 100', 'Rankings · Top 100');
    $('#rkBack').textContent = T('← Zurück', '← Back');
    if (hit && !force && Date.now() - hit.t < 3e5) return paint(hit.rows);
    $('#rkList').innerHTML = `<div class="rm">${T('Lade Rangliste…', 'Loading ranking…')}</div>`;
    try {
      const [a, b] = await Promise.all([page(MODES[mode][0], type, 1), page(MODES[mode][0], type, 2).catch(() => [])]);
      if (my !== tok) return;
      const rows = a.concat(b).slice(0, 100); cache.set(key, { t: Date.now(), rows }); paint(rows);
    } catch (e) {
      if (my !== tok) return;
      $('#rkList').innerHTML = `<div class="rm">${e.message === 'rate' ? T('Zu viele Anfragen, bitte kurz warten.', 'Too many requests, please wait a moment.') : T('Rangliste konnte nicht geladen werden.', 'Ranking could not be loaded.')}</div>`;
    }
  }
  function tabs() {
    $('#rkModes').innerHTML = MODES.map(([, n], i) => `<button type="button" data-m="${i}" aria-pressed="${i === mode}">${n}</button>`).join('');
    $('#rkType').innerHTML = [['performance', 'pp'], ['score', T('Punkte', 'Score')]].map(([k, n]) => `<button type="button" data-t="${k}" aria-pressed="${k === type}">${n}</button>`).join('');
  }
  v.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.id === 'rkBack') return close();
    if (b.id === 'rkReload') return load(true);
    if (b.dataset.m != null) mode = +b.dataset.m; else if (b.dataset.t) type = b.dataset.t; else return;
    tabs(); load();
  });
  function open() { mode = Math.min(3, Math.max(0, (window.xMode | 0))); v.hidden = false; tabs(); load(); v.scrollTop = 0; }
  function close() { v.hidden = true; }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !v.hidden) close(); });
  const mk = () => { const b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = '🏆 ' + T('Ranglisten', 'Rankings'); b.onclick = open; return b; };
  const g1 = document.getElementById('gear1'), gl = document.getElementById('gLogin');
  if (g1) g1.before(mk());
  if (gl) gl.before(mk());
})();
