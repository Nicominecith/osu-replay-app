# Changelog

## 0.43 (v43)
- Spiel-Ansicht ohne obere Leiste, bildschirmfüllend. ✕-Schließen-Knopf und Map-Import sitzen jetzt im Spiel (schwebendes, verschiebbares Bedienfeld, mobiloptimiert mit großen Touch-Flächen und Safe-Area).
- Map-Import robuster: 4 Mirrors mit Timeout, ZIP-Prüfung, echte Fehlermeldungen statt falschem "✓", Warten bis das Spiel bereit ist, Option "bereits importierte erneut laden", zusätzlich Dateiwahl für .osz.

## 0.42 (v42)
- UI-Feinschliff nach Uiverse-Elementen: Button-Glanz, federnde Schalter (auch "nur mit Replay"), Lade-Punkte statt Text, Karten-Hover, Suchfeld mit Glow. Reduzierte Bewegung wird respektiert.

## 0.41 (v41)
- Gastmodus: Spieler suchen und Scores ansehen ohne Login (App-Token, nur öffentliche Routen). Replays von osu!-Servern bleiben dem Login vorbehalten; klarer Hinweis im UI.
- Projektstruktur für Teams: Tests (`node:test`), CI, Syntax-Check, Doku, `.env.example`.

## v40
- CSP für das Spiel erlaubt `'unsafe-eval'` (PixiJS braucht es).

## v39
- Traceable (TC): Slider-Umriss und dezenter Kreis-Ring sichtbar.

## v38
- Sicherheits-Härtung: API unter `/api/*`, echte Login-Prüfung, Whitelist für osu!-Pfade, SSRF-Schutz im Skin-Proxy, OAuth-`state`, Rate-Limits, Security-Header, lokales LZMA statt CDN, Upload-/ZIP-Limits.
