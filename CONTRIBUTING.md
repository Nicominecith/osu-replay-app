# Mitarbeiten

1. Node >= 20 (`.nvmrc`). Keine Abhängigkeiten installieren nötig.
2. Vor jedem Commit: `npm run verify`. Die CI führt dasselbe auf Node 20 und 22 aus.
3. Backend-Änderungen brauchen einen Test in `tests/` (Netzwerk und DNS werden gestubbt, keine echten Aufrufe).
4. Keine externen Skript-CDNs. Bibliotheken nach `public/vendor/` legen, Version und Lizenz in `THIRD_PARTY_NOTICES.md` eintragen.
5. Neue Hosts, die der Browser aufruft, in der CSP in `netlify.toml` begründen.
6. Secrets nie committen (`.env` ist ignoriert; Vorlage: `.env.example`).
7. Bei Änderungen an `public/` die Cache-Version `V` in `public/sw.js` erhöhen.
8. Änderungen im `CHANGELOG.md` festhalten.
