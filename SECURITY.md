# Sicherheit

## Schwachstelle melden
Bitte nicht öffentlich als Issue, sondern per E-Mail an den Betreiber (Kontakt hier eintragen).

## Maßnahmen (Stand v41)
- **Keine Secrets im Frontend.** Client-Secret und Tokens bleiben serverseitig; das Nutzer-Token liegt in einem HttpOnly-Cookie.
- **Login:** OAuth mit `state` (Schutz vor Login-CSRF), Fehlerseiten ohne Interna, Limiter.
- **API-Gateway:** Whitelist für Pfade und Parameter, Typ- und Bereichsprüfung, nur `GET`, Antwortgrößen begrenzt, Timeouts, generische Fehlermeldungen, keine Token oder Inhalte in Logs.
- **Gastmodus:** nur öffentliche Lese-Routen über ein App-Token; Replay-Downloads nie ohne Nutzer-Login.
- **SSRF-Schutz** im Skin-Proxy: nur https/443, keine IP-Literale, interne Adressbereiche gesperrt, Prüfung der DNS-Auflösung beim Verbindungsaufbau, Redirects einzeln geprüft, Größenlimit, ZIP-Magic-Prüfung.
- **Rate-Limits:** Netlify-Regel (120/Min/IP) plus Zusatz-Limiter je Route.
- **Header:** CSP, HSTS, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP.
- **Frontend:** Escaping inkl. `'`, CSS-URLs gefiltert, Datei-/ZIP-Limits und Schutz vor Entpack-Bomben, `localStorage`-Werte typgeprüft, keine externen Skript-CDNs (Lieferkette).
- **Service Worker:** Cache wird beim Logout geleert; Skin-Routen werden nie gecacht.

## Bekannte Grenzen
- CSP erlaubt `'unsafe-inline'` (Inline-Code der App); für das Spiel zusätzlich `'unsafe-eval'` (PixiJS erzeugt Shader-Code zur Laufzeit). `connect-src` erlaubt `https:`, weil Skin- und Mirror-Hosts nicht festgelegt sind.
- Der Zusatz-Limiter gilt nur pro Funktionsinstanz.
- Der Service Worker cached Score-Antworten für Offline-Nutzung bis zum Logout.

## Nach jedem Deploy prüfen
Deploy-Log zeigt die Rate-Limit-Regel für `/api/*`; Browser-Konsole zeigt keine CSP-Meldungen ("Refused to …") bei Login, Replay, Skin-Galerie und Spiel.
