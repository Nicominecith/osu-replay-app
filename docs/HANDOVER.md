# Übergabe / Verkauf: Checkliste

Diese Liste sammelt alles, was ein Käufer oder ein neues Team klären oder tun muss. Sie ist keine Rechtsberatung.

## 1. Rechte (vor dem Verkauf klären)
- [ ] **Spiel `public/nicominecith/`**: Wer hat es geschrieben, unter welcher Lizenz steht es, darf es weitergegeben/verkauft werden? Im Repo liegt nur der fertige Build. Ohne Nachweis entweder entfernen oder vom Verkauf ausnehmen.
- [ ] **Spiel-Assets** (`assets/skins`, `assets/packs`, `assets/samples`, Schriften): Herkunft und Lizenzen nachweisen (Skins/Sounds aus osu! oder von Community-Autoren sind oft nicht frei).
- [ ] **Marke/Name:** "osu!" gehört ppy. Name, Logo und Banner der App prüfen (`banner.png` fehlt aktuell im Hauptordner, es wird ein Supabase-Bild als Fallback geladen: Besitzer und Weiterbestand klären).
- [ ] **osu!-API-Bedingungen** lesen und einhalten (OAuth-App gehört zum Konto des Betreibers).
- [ ] **Lizenz des Projekts** festlegen (`LICENSE`-Datei fehlt absichtlich: Entscheidung des Eigentümers).

## 2. Konten und Geheimnisse
- [ ] Käufer legt eigene **osu!-OAuth-App** an, setzt die Callback-URL `https://<seite>/.netlify/functions/auth`.
- [ ] `OSU_CLIENT_SECRET` des Verkäufers nach der Übergabe **widerrufen/neu erzeugen**.
- [ ] Git-Verlauf auf versehentlich committete Secrets prüfen (z. B. mit `gitleaks`); in dieser Version wurden keine Secrets im Code gefunden, der Verlauf konnte aber nicht geprüft werden.
- [ ] Netlify-Site, Domain, Analytics und Zugänge übertragen; Zugänge des Verkäufers entfernen.

## 3. Externe Abhängigkeiten (Ausfall = Funktionsverlust)
| Dienst | Genutzt für |
|---|---|
| osu.ppy.sh | Login, Scores, Beatmap-Dateien |
| catboy.best, api.nerinyan.moe | Beatmap-Zips, Audio, Hintergründe (Mirrors) |
| apis.issou.best (o!rdr) | Skin-Galerie |
| Supabase-Storage (fremdes Projekt) | Banner-Fallback |
| fonts.googleapis.com | Schrift (siehe Datenschutz) |

## 4. Datenschutz (Deutschland/EU)
- [ ] Impressum und Datenschutzerklärung ergänzen (Login über osu!, Cookies `osu_t`/`osu_st`, Hosting bei Netlify, `localStorage`).
- [ ] **Google Fonts lokal einbinden** (aktuell externer Abruf, übermittelt IP-Adressen an Google). Schriftdateien nach `public/` legen, `<link>` und CSP anpassen.
- [ ] Das Spiel enthält einen Verweis auf Vercel Analytics, der durch die CSP blockiert wird; bei Bedarf entfernen.

## 5. Technik für das neue Team
- [ ] `npm run verify` läuft grün (CI auf GitHub Actions eingerichtet).
- [ ] Deploy-Log: Rate-Limit-Regel für `/api/*` vorhanden.
- [ ] Browser-Test nach Deploy: Login, Gastmodus, Replay, Skin-Galerie, Spiel, Offline (PWA).
- [ ] Empfohlene nächste Schritte: `index.html` in Module aufteilen (Build mit Vite), danach CSP ohne `'unsafe-inline'`; Browser-E2E-Tests (Playwright); Monitoring/Alerts für Funktionsfehler; Schriften lokal hosten.

## 6. Bekannte Einschränkungen
- Replays von osu!-Servern nur mit Login (osu!-API-Vorgabe).
- Nur osu!standard.
- Rate-Limit pro IP; Gastmodus teilt sich das API-Kontingent der OAuth-App.
