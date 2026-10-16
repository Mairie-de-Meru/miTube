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

## 2026-10-15 — Mode direct sans jeton : proxy Cloudflare Worker

**Contexte.** Le mode GitHub Actions oblige à créer et saisir un jeton GitHub. Gildas veut un téléchargement direct depuis le navigateur, sans jeton. Une page statique ne peut pas appeler YouTube (CORS) ni lire les flux googlevideo (pas d'en-têtes CORS, URL liées à l'IP).

**Décision.** Un Worker Cloudflare gratuit (`worker/`) relaie deux choses seulement : `GET /info` (API interne YouTube, client iOS, URL directes sans signature) et `GET /stream` (uniquement `*.googlevideo.com`, avec Range). Accès limité aux origines de `ALLOWED_ORIGINS`. Le navigateur télécharge par tranches de 8 Mo (3 en parallèle) puis assemble image et son (MP4 H.264 + M4A) avec ffmpeg.wasm sans ré-encodage. Le mode Actions reste disponible pour les playlists, sous-titres, MP3 et abonnements.

**Alternatives écartées.** Extension navigateur (plus un simple site), Cobalt (dépend d'un tiers), Invidious (écarté plus tôt : anti-bot sur le proxy média).

**Conséquences.** Dépend d'un compte Cloudflare et d'une API YouTube non officielle (peut casser sans préavis). Risque principal non testé : YouTube peut refuser les IP de datacenter de Cloudflare (« confirm you're not a bot »), et les URL googlevideo liées à l'IP peuvent échouer si l'IP de sortie du Worker change entre `/info` et `/stream`. Le code reste valable dans les deux cas ; le repli est le mode Actions.

## 2026-10-16 — Durcissement du Worker public

**Contexte.** Le Worker est utilisé par tous les visiteurs du site : il ne doit offrir aucune prise à un détournement ni à l'accès au compte Cloudflare.

**Décision.** Le Worker n'a ni secret, ni KV/D1/R2, seulement `ALLOWED_ORIGINS` et un limiteur de débit : une faille ne donne accès à rien d'autre. Il ne contacte que `youtube.com/youtubei/v1/player` (URL fixe) et `*.googlevideo.com/videoplayback` (liste blanche, redirections revalidées, plage ≤ 16 Mo obligatoire, pas de téléchargement intégral). Les en-têtes sont filtrés. L'en-tête Origin est contournable hors navigateur : la limite de débit par IP et la plage bornée limitent l'abus de quota.

**Conséquences.** Pour le déploiement, éviter de laisser le jeton OAuth de wrangler (portée très large) : `wrangler logout` après le déploiement, ou utiliser un jeton API dédié « Workers Scripts : Edit ».

## 2026-10-16 — Retour au mode GitHub Actions par défaut

**Contexte.** Le Worker Cloudflare est déployé mais YouTube refuse toutes ses requêtes (8 clients testés, IP Cloudflare signalées).

**Décision.** GitHub Actions redevient le mode par défaut. Le jeton ne peut pas être supprimé (aucun moyen de lancer un workflow depuis une page statique sans authentification, et le flux OAuth de GitHub n'est pas utilisable sans serveur) : on réduit l'effort à une saisie unique, avec lien de création prérempli et accueil en un écran. Le mode direct reste dans le code, masqué sans adresse de Worker.

**Conséquences.** Le Worker déployé n'est plus utile pour YouTube ; il peut être supprimé du compte Cloudflare. Le transfert du dépôt vers Mairie-de-Meru change l'URL de Pages et l'origine autorisée du Worker.
