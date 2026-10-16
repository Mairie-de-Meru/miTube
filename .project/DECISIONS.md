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

## 2026-10-16 — miTube : dépôt de l'organisation, jeton public à droits minimaux, suppression du Worker

- **Contexte** : l'utilisateur final ne doit saisir aucun jeton ; l'administrateur (Gildas) peut le fournir, avec le moins de droits possible. Le mode direct (Worker Cloudflare) est inutilisable pour YouTube (IP Cloudflare bloquées).
- **Décision** : nouveau dépôt public `Mairie-de-Meru/miTube` (nom sans « -pages ») ; Worker supprimé (code et déploiement) ; jeton fin « Actions : Read and write » sur ce seul dépôt, stocké en secret `PUBLIC_TOKEN` et injecté au build (`VITE_PUBLIC_TOKEN`). Il est lisible dans le site publié : il ne doit jamais avoir d'autre droit (ni Contents, ni Secrets). Interface réduite à lien + format (MP4 plusieurs qualités, MP3, M4A). L'ancien dépôt `appweb514-svg/metube-pages` n'est plus la référence.
- **Conséquences** : la validation se fait obligatoirement côté Actions (mode public strict par défaut, `PUBLIC_MODE=0` pour l'administrateur). Renouvellement annuel du jeton. Artefacts lisibles de tout compte GitHub (dépôt public) : pas de contenu privé. Abonnements indisponibles en mode public (ils exigent Contents:write).

## 2026-10-16 — Repli Invidious pour le blocage anti-bot YouTube
- **Contexte** : les IP des runners GitHub sont refusées par YouTube pour certaines vidéos. Gildas refuse les cookies et le runner auto-hébergé et demande de passer par Invidious.
- **Décision** : en cas d'échec yt-dlp (message anti-bot), `ytdl_run.py` tente `invidious.run_fallback` : API JSON d'une instance, repli sur plusieurs instances, flux choisis (MP4 h264+AAC, audio, MP3/M4A via ffmpeg), 3 h / 2 GiB en public. Instances via `INVIDIOUS_INSTANCES`, champ admin du formulaire (`payload.invidiousInstances`, ignoré en mode public), coupure par `INVIDIOUS_FALLBACK=0`.
- **Conséquences** : test réel sur runner, vidéo bloquée : l'API répond mais le flux direct est refusé (403) ; les URL proxifiées sont derrière Anubis (non contourné). Le repli est donc best-effort et ne remplace pas `YTDLP_COOKIES`. 4 instances officielles sur 5 ont l'API désactivée.

## 2026-10-16 — Sortie par proxy plutôt que contournement du blocage anti-bot
- **Contexte** : Invidious ne suffit pas ; Gildas veut une solution hors cookie. Tests sur runner : clients yt-dlp (10 sur 2 vidéos), Piped (15 hôtes), Cobalt (auth requise) : tous échouent ; les URL de flux d'un navigateur sont liées à son IP.
- **Décision** : le blocage est lié à l'IP du datacenter. Ajout du secret facultatif `YTDLP_PROXY` (validé par `ytdl_opts.proxy_from_env`, appliqué à yt-dlp dans `ytdl_run.py` et `subscriptions_check.py`). Pas de contournement par Tor/proxys publics.
- **Conséquences** : la seule voie sans cookie est une IP de sortie propre fournie par l'utilisateur (proxy résidentiel, Tailscale/WireGuard à ajouter) ; non vérifiable sans ce proxy.
