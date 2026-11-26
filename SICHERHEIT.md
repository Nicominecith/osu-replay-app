# Sicherheit – Stand v38

## Einmalig nach dem Deploy prüfen
1. **Deploy-Log** (Schritt "Post-processing") muss eine gültige Rate-Limit-Regel für `/api/*` zeigen. Fehlt sie, greift nur der Zusatz-Limiter in der Funktion.
2. **Login** mit osu! testen, dann Scores laden, ein Replay abspielen, Skin-Galerie öffnen, "▶ Spielen" starten.
3. **Browser-Konsole** (F12) auf Meldungen "Refused to …" prüfen: das wäre die Content-Security-Policy. Betroffenen Host in `netlify.toml` ergänzen.
4. **Environment-Variablen** in Netlify: `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, `SITE_URL` (alle nur serverseitig, nie im Frontend).
5. osu!-Callback bleibt `https://DEINE-SEITE/.netlify/functions/auth` (unverändert).

## Was geändert wurde
- API jetzt unter `/api/*` (eine Funktion `gateway.mjs`); alte Einzel-Funktionen entfernt.
- Login-Prüfung echt: Token wird bei osu! validiert (vorher reichte irgendein Cookie `osu_t=x`).
- osu!-API-Proxy: nur freigegebene Pfade UND Parameter (Typ/Bereich geprüft).
- Skin-Proxy gegen SSRF gesichert (nur https/443, keine internen IPs, DNS-Prüfung beim Verbindungsaufbau, Redirects einzeln geprüft, Größenlimit).
- OAuth `state` gegen Login-CSRF; Fehlermeldungen ohne osu!-Interna.
- Rate-Limits: Netlify-Regel (120/Min/IP) + Zusatz-Limiter je Route.
- Security-Header + CSP, CDN-Skript (jsDelivr) durch lokale Datei ersetzt.
- Frontend: `esc()` escaped jetzt auch `'`, CSS-URLs gefiltert, Datei-/ZIP-Größenlimits, Schutz vor Entpack-Bomben, Einstellungen aus localStorage typgeprüft.
- Service Worker: Cache beim Logout geleert, `/api/skin(s)` nie gecacht.
