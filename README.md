# Osu Replay

osu!-Replay-Viewer als installierbare Web-App (PWA). Eigene und fremde Replays ansehen, Skins nutzen, osu!standard im Browser spielen.

- **Frontend:** statische Seite in `public/` (Vanilla JS, kein Build-Schritt)
- **Backend:** Netlify Functions in `netlify/functions/` (Login + API-Proxy), keine Datenbank
- **Hosting:** Netlify

## Funktionen

| Funktion | Ohne Anmeldung (Gast) | Mit osu!-Login |
|---|---|---|
| Lokale `.osr`-Datei abspielen | ja | ja |
| Spieler suchen, Scores und Map-Infos ansehen | ja | ja |
| Replays von osu!-Servern abspielen (eigene und fremde) | **nein** | ja |
| Skin-Galerie, Maps ins Spiel importieren | nein | ja |
| Spiel (nicominecith osu!), Einstellungen, Tutorial | ja | ja |

Warum Replays den Login brauchen: osu! stellt den Replay-Download in der API nur für angemeldete Nutzer bereit. App-Tokens ohne Nutzer (Client Credentials) haben dafür keinen Zugriff.

## Schnellstart

```bash
npm run verify          # Syntax-Check + Tests (Node >= 20, keine Abhängigkeiten)
npx netlify-cli dev     # lokal starten (Env-Variablen aus .env, siehe .env.example)
```

## Konfiguration

Drei Umgebungsvariablen in Netlify (siehe `.env.example`): `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`, `SITE_URL`.
Die Callback-URL der osu!-OAuth-App muss `https://<seite>/.netlify/functions/auth` lauten.

## Projektstruktur

```
public/                 statische Seite (index.html, sw.js, manifest, vendor/, nicominecith/)
netlify/functions/
  auth.js               OAuth-Login/-Logout (feste URL, Callback bei osu! hinterlegt)
  gateway.mjs           alle API-Routen unter /api/* (osu, beatmap, skins, skin)
tests/                  node:test, ohne Netzwerk (fetch/DNS werden gestubbt)
scripts/                Syntax- und Regelprüfung
docs/                   Architektur, Übergabe-Checkliste
netlify.toml            Build, Security-Header, CSP
```

## Weiterführend

- [Architektur](docs/ARCHITECTURE.md) · [Sicherheit](SECURITY.md) · [Übergabe/Verkauf](docs/HANDOVER.md)
- [Mitarbeiten](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [Drittanbieter-Lizenzen](THIRD_PARTY_NOTICES.md)
