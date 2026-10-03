# Documentation de Sijil

- `Sijil-Manuel.pdf` : manuel d'utilisation avec captures d'écran (27 pages).
- `Sijil-Manuel.docx` : le même manuel, modifiable dans Word.
- `Sijil-Presentation.pptx` : présentation commerciale (19 diapositives).
- `captures/` : captures d'écran d'une **entreprise fictive** (SARL Horizon Services). Aucune donnée réelle.
- `build/` : scripts de génération (`content.py` = texte du manuel, `build_manual.py`, `build_deck.py`).

Pour régénérer les captures : `node appscript/dev/server.js` puis le script Playwright de captures ; pour reconstruire les documents : `python3 docs/build/build_manual.py` et `python3 docs/build/build_deck.py`.
- `Securite.md` : revue de sécurité. `../Kit-Sijil/` : copie du kit à déposer dans Drive à côté du classeur.
