/* Bedienfeld im Spiel (nur Seiten-Overlay, der Spielcode bleibt unverändert):
   - ✕ Spiel schließen (wenn in der Osu-Replay-App eingebettet)
   - ⬇ Maps importieren: aus dem osu!-Account (Host-App) oder aus .osz-Dateien
   Dateien werden wie per Drag & Drop an das Spiel übergeben (window "drop"-Ereignis). */
(() => {
  'use strict';
  let host = null;
  try { if (window.parent !== window && window.parent.nicoHost) host = window.parent.nicoHost; } catch { /* anderer Ursprung */ }
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }
    e.append(...kids); return e;
  };
  const POS_KEY = 'nicoBridgePos';
  const dock = el('div', { id: 'nb', 'data-side': 'right' });
  const closeBtn = host ? el('button', { id: 'nbClose', class: 'nb-btn', type: 'button', 'aria-label': 'Spiel schließen', title: 'Spiel schließen', text: '✕' }) : null;
  const impBtn = el('button', { id: 'nbToggle', class: 'nb-btn', type: 'button', 'aria-label': 'Maps importieren', title: 'Maps importieren', 'aria-expanded': 'false', 'aria-controls': 'nbPanel', text: '⬇' });
  const accountBtn = host ? el('button', { class: 'nb-act nb-main', type: 'button', text: '⬇ Maps aus deinem Account' }) : null;
  const filesBtn = el('button', { class: 'nb-act', type: 'button', text: '📁 Dateien wählen (.osz)' });
  const force = el('input', { type: 'checkbox' });
  const forceLbl = host ? el('label', { class: 'nb-chk' }, force, el('span', { text: 'Auch bereits importierte erneut laden' })) : null;
  const status = el('p', { id: 'nbStatus', role: 'status', 'aria-live': 'polite' });
  const picker = el('input', { type: 'file', multiple: '', accept: '.osz,.osk,.osr,.zip,application/zip', hidden: '' });
  const panel = el('div', { id: 'nbPanel', role: 'dialog', 'aria-label': 'Maps importieren', hidden: '' },
    el('h2', { text: 'Maps importieren' }), ...[accountBtn, filesBtn, forceLbl, status].filter(Boolean), picker);
  dock.append(...[closeBtn, impBtn, panel].filter(Boolean));
  document.body.append(dock);

  const say = (t, kind = '') => { status.textContent = t; status.className = kind; };
  let idle = 0;
  const wake = () => { dock.classList.add('nb-on'); clearTimeout(idle); idle = setTimeout(() => { if (panel.hidden) dock.classList.remove('nb-on'); }, 3500); };

  /* ---- Position merken (Seite und Höhe), verschiebbar per Ziehen ---- */
  const applyPos = (side, y) => {
    const h = innerHeight, py = Math.min(Math.max(y, 8), Math.max(8, h - 120));
    dock.dataset.side = side; dock.style.setProperty('--nb-y', py + 'px');
  };
  try { const p = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (p && (p.side === 'left' || p.side === 'right') && isFinite(p.y)) applyPos(p.side, p.y * innerHeight); } catch { /* ignorieren */ }

  /* ---- Panel ---- */
  const placePanel = () => { panel.style.top = '0px'; const r = panel.getBoundingClientRect(), over = r.bottom - (innerHeight - 8); if (over > 0) panel.style.top = -Math.min(over, r.top - 8) + 'px'; };
  const setOpen = open => { panel.hidden = !open; impBtn.setAttribute('aria-expanded', String(open)); if (open) { placePanel(); dock.classList.add('nb-on'); } else wake(); };
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); e.stopPropagation(); setOpen(false); } }, true);
  addEventListener('resize', () => { if (!panel.hidden) placePanel(); });

  /* ---- Ziehen vs. Tippen ---- */
  let drag = null, moved = false;
  dock.addEventListener('pointerdown', e => { const b = e.target.closest('.nb-btn'); wake(); if (!b) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY, top: dock.getBoundingClientRect().top, b }; moved = false; });
  dock.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    if (!moved) { moved = true; try { drag.b.setPointerCapture(e.pointerId); } catch { /* ok */ } setOpen(false); }
    applyPos(e.clientX < innerWidth / 2 ? 'left' : 'right', drag.top + (e.clientY - drag.y));
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (moved) { const top = dock.getBoundingClientRect().top; try { localStorage.setItem(POS_KEY, JSON.stringify({ side: dock.dataset.side, y: top / innerHeight })); } catch { /* ok */ } }
    drag = null; setTimeout(() => { moved = false; }, 0);
  };
  dock.addEventListener('pointerup', endDrag); dock.addEventListener('pointercancel', endDrag);
  dock.addEventListener('click', e => { if (moved) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);

  /* ---- Dateien an das Spiel übergeben (wie Drag & Drop) ---- */
  const deliver = (name, buf) => {
    const file = new File([buf], name, { type: 'application/x-osu-beatmap-archive' });
    let ev;
    try { const dt = new DataTransfer(); dt.items.add(file); ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }); }
    catch { ev = new Event('drop', { cancelable: true }); Object.defineProperty(ev, 'dataTransfer', { value: { files: [file] } }); }
    window.dispatchEvent(ev);
    return new Promise(r => setTimeout(r, 1800)); // dem Spiel Zeit zum Verarbeiten geben
  };
  const gameReady = async () => {
    const t0 = Date.now(); let seen = 0;
    while (Date.now() - t0 < 30000) {
      if (document.querySelector('#app canvas')) { seen = seen || Date.now(); if (Date.now() - seen > 1500) return true; }
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  };
  let busy = false;
  const lock = on => { busy = on; for (const b of [accountBtn, filesBtn]) if (b) b.disabled = on; };

  if (closeBtn) closeBtn.addEventListener('click', () => { try { host.close(); } catch { /* ignorieren */ } });
  impBtn.addEventListener('click', () => setOpen(panel.hidden));
  filesBtn.addEventListener('click', () => { if (!busy) picker.click(); });
  picker.addEventListener('change', async () => {
    const files = [...picker.files].slice(0, 20); picker.value = ''; if (!files.length) return;
    lock(true);
    try {
      say('Spiel wird vorbereitet…', 'busy');
      if (!(await gameReady())) { say('Das Spiel ist noch nicht bereit. Bitte kurz warten und erneut versuchen.', 'err'); return; }
      let n = 0; for (const f of files) { say(`Importiere ${++n}/${files.length}: ${f.name.slice(0, 40)}`, 'busy'); await deliver(f.name, await f.arrayBuffer()); }
      say(`${files.length} Datei${files.length > 1 ? 'en' : ''} an das Spiel übergeben.`, 'ok');
    } catch { say('Import fehlgeschlagen.', 'err'); } finally { lock(false); }
  });
  if (accountBtn) accountBtn.addEventListener('click', async () => {
    if (busy) return; lock(true);
    try {
      say('Spiel wird vorbereitet…', 'busy');
      if (!(await gameReady())) { say('Das Spiel ist noch nicht bereit. Bitte kurz warten und erneut versuchen.', 'err'); return; }
      await host.importMaps({ deliver, status: say, force: force.checked });
    } catch { say('Import fehlgeschlagen.', 'err'); } finally { lock(false); }
  });
  wake();
})();
