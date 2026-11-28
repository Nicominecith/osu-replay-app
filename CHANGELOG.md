## v0.59
- osu!taiko, osu!catch und osu!mania: Replays ansehen (Auto-Erkennung aus der .osr), eigene Darstellung je Modus, Statistik/Graph/Marker aus den Eingaben geschätzt.
- Modus-Umschalter (osu! / taiko / catch / mania) für die Score-Listen; Scroll-Geschwindigkeit für taiko/mania.
- Neue Datei public/modes.js, Tests in tests/modes.test.mjs.

## v0.58
- Versionen (App, Service-Worker-Cache, package.json) vereinheitlicht; Manifest: id, Sprache, Kategorien.
- docs/ROADMAP.md: Status der 100-Punkte-Liste.

## v0.57
- Fixed profile team/group display: reads the osu! `team` object separately from `groups`.
- Supports group entries returned as either strings or objects, and links teams/groups when a URL or team ID is available.
- Shows an explicit API-data message only when neither team nor group membership is present in the returned profile.

## v0.56
- Fixed replay opening: removed calls to an undefined `el()` helper that stopped map details and replay loading.
- Fixed profile panel creation using native DOM APIs; own profile and replay-owner profile buttons now open the profile view.
- Improved mobile profile overlay stacking and touch interaction.

## v0.55
- Fixed replay-owner display: replaces the broken emoji placeholder with a styled player/avatar control.
- Made own-profile opening work by tap and keyboard, with a mobile full-screen profile panel.
- Profile data now falls back to already-loaded player information if the profile API request fails.
- Added avatar fallbacks when osu! avatar images are unavailable.

# Changelog

## 0.54 (v54)
- Spielerprofile im osu!-Stil: Avatar, Land, Spielmodus, globale/Landes-Rangliste, PP, Accuracy, Level, Spielzeit, Team-/Gruppenzugehörigkeit, Badges und Mitgliedschaft.
- Eigenes Profil über den Account-Button; Profile anderer Spieler aus Suche, Scoreliste, Map-/Replay-Ansicht öffnen.
- Replay-Ansicht und Scorekarten zeigen den zugehörigen Spieler mit direktem Profil-Link.
- Öffentliches osu!-Profil-Endpunkt im API-Gateway für Gast- und eingeloggte Nutzer ergänzt.


## 0.46 (v46)
- Neues Modul `public/extras.js` + `extras.css` (siehe docs/ARCHITECTURE.md).
- Player: Frame-für-Frame (, .), Timeline mit Miss/50/100-Markern, Breaks und Notizen, Sprung zu Misses (auch 10 s davor), Neustart, Hit-Error-Bar mit UR, Input-Overlay (K1/K2/M1/M2, KPS), Statistik-Panel (300/100/50/Miss, Combo, Acc, UR, Ø-Fehler, Accuracy-/HP-Verlauf, Klick-Heatmap, Cursor-Tempo), Zoom auf den Cursor, Ton-Modi (alles/Musik/Hitsounds/stumm), Screenshot, 10-s-Clip (.webm), .osr speichern, teilbarer Link mit Zeitmarke, Notizen, Kino-Modus, FPS-Anzeige.
- Gespeicherte Replays (IndexedDB, max. 12 + Favoriten), „Zurück zum letzten Replay“, Wechsel zum vorigen Replay, Zufalls-Replay, Demo-Modus.
- Schnell-Import per Link/ID (osu!-Score, .osr-Link, Beatmap-Set), Drag & Drop auf der ganzen Seite (.osr, .osz, .osk), Beispiel-Map beim ersten Start von nicominecith osu!.
- Menü (☰): Hilfe mit Tastenkürzeln, Dateiformaten und Modus-Status, Neu/Roadmap, Über, Diagnose + Feedback, Speicherverwaltung, Einstellungen-Code (Export/Import/Reset), Energiesparmodus, Deutsch/Englisch.
- Fehlerhilfe mit Wiederholen-Knopf, Lade-Fortschritt, Modus-Erkennung (taiko/catch/mania erkannt, noch nicht abspielbar), sauberere Offline-Erkennung, Browser-Zurück schließt den Player.

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
