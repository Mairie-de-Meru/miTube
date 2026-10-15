# Décisions

## 2026-10-15 — Architecture : front statique + yt-dlp dans GitHub Actions

**Contexte.** Demande : « MeTube sur GitHub Pages ». MeTube = interface Angular + serveur Python qui enveloppe yt-dlp (+ ffmpeg). GitHub Pages ne sert que du statique. yt-dlp ne tourne pas dans un navigateur (Python, ffmpeg, CORS des sites).

**Options évaluées.**
- (a) Front React statique + GitHub Actions (`workflow_dispatch` via l'API REST depuis le navigateur avec un jeton fin) qui exécute yt-dlp et publie des artefacts. Gratuit, aucun serveur, toutes les options de MeTube restent possibles (même yt-dlp, même ffmpeg). Limites : IP de datacenter souvent bloquées par YouTube (cookies requis), conditions d'Actions (usage « sans rapport avec le projet logiciel »), pas de progression fine, latence 10–60 s, quota d'artefacts 500 Mo en compte gratuit.
- (b) Front + backend gratuit : Cloudflare Workers/Pages Functions ne peuvent pas exécuter Python/yt-dlp/ffmpeg ; Pyodide/WASM ne résout ni CORS ni ffmpeg et yt-dlp s'y heurte aux requêtes cross-origin. Écarté.
- (c) API tierces (cobalt, Invidious, Piped) depuis le navigateur : dépendance à des instances publiques instables/limitées, fonctionnalités incomplètes, pas de fusion audio/vidéo ni de post-traitement. Écarté (peut être une extension future).
- (d) Front se connectant à une vraie instance MeTube de l'utilisateur : fonctionnel mais exige justement le serveur que l'utilisateur veut éviter. Écarté pour cette version.

**Décision.** Option (a). Pas de question à l'utilisateur : (b), (c) et (d) ne sont pas des alternatives réalistes au besoin « aucun serveur, tout gratuit ».

**Choix de conception.**
- Une requête JSON versionnée (`v:1`) dans un seul input `payload` (aucune interpolation shell : passée par variable d'environnement), validée par `scripts/ytdl_opts.py` (liste blanche des valeurs, interdiction de `cookiefile`/`outtmpl`/`paths`, gabarit de sortie confiné).
- Corrélation job ↔ run via `run-name: "metube <job_id>"`; état dérivé des runs et artefacts (pas de base de données).
- Résultats : artefact `metube-<id>` (fichiers) + `metube-<id>-meta` (`result.json`). Téléchargement par l'API (redirection signée).
- Jeton fin limité au dépôt (Actions : read/write) stocké côté navigateur uniquement ; option « moteur dans un dépôt privé » (le champ dépôt peut différer du dépôt Pages).
- Cookies en secret de dépôt (`YTDLP_COOKIES`), jamais via l'interface.
- Abonnements : `data/subscriptions.json` sur la branche `metube-data` (permission Contents), workflow planifié toutes les 6 h.
- `base: './'` dans Vite : fonctionne sous `/<repo>/`, domaine personnalisé, sans configuration.
- Licence AGPL-3.0 (catalogue et mapping de formats dérivés de MeTube).

**Conséquences.** Non vérifié de bout en bout sur GitHub (dépôt distant non créé) : à tester par l'utilisateur après fork. Voir README pour les limites.
