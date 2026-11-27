# Changelog

## 0.45 (v45)
- Zusammengeführt: Spiel-Menüeinträge (Account-Import, Spiel schließen), Datei-Dialog-Fix, Exit und Zurück-Taste aus v44, plus WebGL-Umstellung gegen den schwarzen Bildschirm auf Handys.
- Skin-Download repariert: Große Skins (bis 25 MB) kommen jetzt als Stream über den Proxy (vorher Abbruch bei über 4,5 MB). Vorab-Laden beim Antippen am Handy entfernt, das hat das Anfragelimit aufgebraucht. Bei "zu viele Anfragen" und Verbindungsfehlern wird bis zu 3x neu versucht, Fehlermeldungen sind lesbar.

## 0.44 (v44)
- Spiel: Schwebendes Bedienfeld (✕/⬇) und Leiste sind weg. Stattdessen zwei neue Einträge im Spiel-Menü (Einstellungen → Maintenance → „Osu Replay"): „Maps aus deinem osu!-Konto importieren" und „Spiel schließen".
- Import auf dem Handy repariert: Der Datei-Dialog des Spiels (Hauptmenü „Import" und „Import beatmaps (.osz)") hing an einem nicht eingebundenen Eingabefeld mit `.osz`-Filter, den Android nicht kennt. Jetzt ist das Feld eingebunden, der Filter entfällt auf Handys und die Auswahl wird nach Endung geprüft.
- Hauptmenü-Knopf „Exit" schließt das eingebettete Spiel und bringt zur App zurück.
- Handy: Die Zurück-Taste schließt das Spiel, statt die Seite zu verlassen.

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
