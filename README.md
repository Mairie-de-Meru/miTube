# MeTube Pages

Une version de [MeTube](https://github.com/alexta69/metube) qui s'installe sur **GitHub Pages**, sans serveur à toi.

- L'**interface** (React) est un site statique hébergé gratuitement sur `https://<toi>.github.io/<dépôt>/`.
- Le **téléchargement** est fait par **yt-dlp dans GitHub Actions** (les serveurs de GitHub), lancé depuis l'interface. Les fichiers te sont rendus sous forme d'artefacts que tu télécharges depuis la page.

> ## À lire avant d'installer : ce que cette version ne peut pas faire
>
> yt-dlp ne peut pas tourner dans un navigateur (pas de Python, pas de ffmpeg, pas d'accès cross-origin aux sites). Une page 100 % statique ne peut donc pas télécharger de vidéos seule : il faut un moteur d'exécution quelque part. Ici, c'est GitHub Actions. Conséquences, sans embellir :
>
> | Limite | Détail |
> |---|---|
> | **YouTube peut bloquer les serveurs GitHub** | Les runners ont des IP de datacenter. Test réel du 15/10/2026 (yt-dlp 2026.08.19, sans cookies, runner Ubuntu) : liste des formats jusqu'en 4K et téléchargement d'une vidéo publique OK. Ça peut changer à tout moment (YouTube durcit régulièrement) : si vous voyez « Sign in to confirm you're not a bot », ajoutez des **cookies** (secret `YTDLP_COOKIES`) ou un **proxy** (variable `YTDL_OPTIONS`, ex. `{"proxy": "http://…"}`). Les cookies ne sont requis que pour les vidéos privées, avec limite d'âge ou réservées aux membres. Les instances Invidious publiques ne sont pas une alternative viable (proxy média protégé par anti-bot). |
> | **Conditions d'utilisation de GitHub** | Les conditions d'Actions interdisent les usages « sans rapport avec la production, le test, le déploiement ou la publication du projet logiciel » et l'usage d'Actions comme CDN. Télécharger des médias avec Actions est une zone grise : GitHub peut limiter ou suspendre un compte qui en abuse. **Usage personnel et modéré uniquement, à tes risques.** Respecte aussi les conditions des sites et le droit d'auteur. |
> | **Pas de progression en direct** | L'API de GitHub ne donne que l'état (en attente / en cours / terminé) et l'étape courante, pas le pourcentage ni la vitesse. |
> | **Latence** | Un téléchargement démarre en 10 à 60 s (file d'attente + installation de yt-dlp), pas instantanément. |
> | **Pas de dossier de téléchargement partagé** | Les fichiers sont des artefacts (zip) conservés 7 jours par défaut (1 à 90 jours), pas un dossier sur un serveur. Quota de stockage Actions : 500 Mo avec un compte gratuit (en dépôt public ou privé), partagé avec tes autres dépôts. Un artefact expiré ou supprimé libère la place. |
> | **Minutes Actions** | Dépôt public : gratuit et illimité. Dépôt privé : 2 000 min/mois en compte gratuit. Un job dure 1 à 3 min en général, 6 h maximum. |
> | **Confidentialité** | Dans un **dépôt public**, les journaux d'Actions (donc les adresses téléchargées) sont publics, et les artefacts sont lisibles par tout compte GitHub qui en connaît l'identifiant. Voir « Option confidentielle » ci-dessous. |
> | **Parcourir une playlist** | La sélection individuelle des vidéos d'une playlist (« Browse playlist » de MeTube) n'est pas reprise : on télécharge toute la playlist avec une limite (« Items limit »). |
> | **Dossiers personnalisés, miniatures de dossier, `CUSTOM_DIRS`** | Sans objet : il n'y a pas de système de fichiers persistant. Le modèle de nom de sortie reste réglable. |

## Fonctionnalités reprises de MeTube

| MeTube | MeTube Pages |
|---|---|
| Ajouter une ou plusieurs URL (vidéo, playlist, chaîne), des centaines de sites | ✅ identique (tout ce que yt-dlp sait faire) |
| Type Video / Audio / Captions / Thumbnail | ✅ |
| Vidéo : qualité (Best → 240p, Worst), format (Auto / MP4 / iOS), codec (H.264, H.265, AV1, VP9) | ✅ mêmes sélecteurs yt-dlp que MeTube |
| Audio : M4A, MP3, OPUS, WAV, FLAC, débits, tags + pochette | ✅ |
| Sous-titres : formats SRT/TXT/VTT/TTML/SBV/SCC/DFXP, langue, manuel/auto | ✅ |
| Limite d'éléments pour playlists/chaînes, découpage par chapitres | ✅ |
| Modèle de nom de sortie | ✅ (par téléchargement) |
| File d'attente, terminés/échecs, suppression, nouvelle tentative, annulation | ✅ (via les exécutions Actions) |
| Cookies (vidéos privées, limitées par l'âge, anti-bot) | ✅ via un secret du dépôt |
| Options yt-dlp globales, presets nommés, surcharges par téléchargement | ✅ |
| yt-dlp nightly | ✅ (variable `YTDLP_CHANNEL=nightly`) |
| Thème clair / sombre / auto | ✅ |
| Abonnements (chaînes, playlists) | ✅ (vérification toutes les 6 h, voir plus bas) |
| Téléchargements simultanés limités | ➖ GitHub gère la file de ses runners |
| Progression en % / vitesse / ETA | ❌ voir limites |
| Navigateur de playlist, dossiers, audio dans un dossier séparé | ❌ voir limites |
| Extension navigateur / bookmarklet / API | ❌ |

## Installation en quelques clics

1. **Fork** ce dépôt (bouton *Fork* en haut à droite). Garde le nom `metube-pages` ou change-le, peu importe.
2. Dans ton fork, onglet **Actions** : clique sur *« I understand my workflows, go ahead and enable them »*.
3. **Settings → Pages → Build and deployment → Source : GitHub Actions**.
4. Onglet **Actions → « Deploy to GitHub Pages » → Run workflow**. Au bout d'une minute, le site est en ligne sur `https://<ton-pseudo>.github.io/<nom-du-fork>/`.
5. Crée un **jeton d'accès fin** (*fine-grained personal access token*) : GitHub → Settings → Developer settings → Personal access tokens → *Fine-grained tokens* → *Generate new token* :
   - *Repository access* : **Only select repositories** → ton fork uniquement ;
   - *Permissions → Repository permissions* : **Actions : Read and write** (et *Metadata : Read*, ajouté automatiquement). Rien d'autre, sauf *Contents : Read and write* si tu veux les abonnements ;
   - expiration : 90 jours ou moins.
6. Ouvre ton site, clique sur la roue dentée, colle le jeton (le dépôt est déjà détecté), *Test connection*. Colle une URL, *Add*. C'est parti.

Le jeton est enregistré **dans ton navigateur uniquement** (case « Remember on this device » : sinon il disparaît à la fermeture de l'onglet) et n'est envoyé qu'à `api.github.com`. Ne le partage pas : quiconque l'a peut lancer des exécutions dans ton fork.

### Option confidentielle (recommandée)

Les Pages d'un dépôt privé exigent un compte payant, mais le **moteur** de téléchargement peut vivre dans un autre dépôt. Pour garder tes adresses et tes fichiers hors de la vue du public :

1. Crée un **dépôt privé** (par ex. `metube-worker`) contenant les mêmes fichiers (*Use this template* ou copie) ; garde-le sans Pages.
2. Crée le jeton fin sur **ce dépôt privé**.
3. Dans les réglages du site (fork public avec Pages), mets `toi/metube-worker` dans le champ *Repository*.

### Cookies (facultatif : vidéos privées, limitées par l'âge, ou si YouTube bloque)

1. Exporte tes cookies au format *Netscape* avec une extension de navigateur (par ex. « Get cookies.txt LOCALLY »), depuis un compte secondaire (YouTube peut bannir un compte utilisé avec yt-dlp). Pour qu'ils ne soient pas renouvelés par YouTube : fenêtre privée, connexion, ouvrir seulement `youtube.com/robots.txt`, exporter, puis fermer la fenêtre.
2. Dépôt du moteur → **Settings → Secrets and variables → Actions → Secrets → New repository secret** : nom `YTDLP_COOKIES`, valeur = le contenu du fichier.

Les cookies ne passent jamais par l'interface web et ne sont jamais écrits dans les artefacts.

### Réglages avancés (variables du dépôt)

*Settings → Secrets and variables → Actions → Variables* :

| Variable | Rôle | Défaut |
|---|---|---|
| `YTDL_OPTIONS` | Options yt-dlp globales, JSON (ex. `{"retries": 5}`) | vide |
| `YTDLP_CHANNEL` | `stable` ou `nightly` | `stable` |
| `RETENTION_DAYS` | Jours de conservation des fichiers (1 à 90) | `7` |
| `BASE_PATH` | Chemin de base du site, seulement pour un cas particulier | relatif |

Les *presets* nommés et les surcharges par téléchargement se règlent dans l'interface (roue dentée / « Advanced options »). Ne colle jamais des options yt-dlp d'origine inconnue : certaines (`exec`…) exécutent des commandes sur le runner.

### Abonnements

Nécessite la permission *Contents : Read and write* sur le jeton. Une exécution planifiée (toutes les 6 h, `subscriptions.yml`) regarde les dernières vidéos de chaque chaîne/playlist abonnée et lance un téléchargement pour les nouvelles. La première vérification mémorise l'existant sans rien télécharger. Les GitHub Actions planifiées sont suspendues après 60 jours sans activité dans un dépôt public : relance-les depuis l'onglet Actions si besoin.

## Développement

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint && npm test && npm run build
python3 -m unittest discover -s tests   # logique côté Actions
```

- `src/` : l'application React + TypeScript (Vite). `src/lib/` contient le client de l'API GitHub, le catalogue d'options (aligné sur MeTube) et la fusion runs ↔ artefacts.
- `scripts/` : ce qui s'exécute dans Actions (`ytdl_opts.py` traduit une requête en options yt-dlp, port de `dl_formats.py` de MeTube ; `ytdl_run.py` ; `subscriptions_check.py`).
- `.github/workflows/` : `download.yml` (moteur), `deploy-pages.yml`, `subscriptions.yml`, `ci.yml`.
- `BASE_PATH=/mon-chemin/ npm run build` fixe un chemin de base ; par défaut les chemins sont relatifs (marche partout).

## Licence et crédits

Projet indépendant, non affilié à MeTube ni à yt-dlp. Il s'appuie sur [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense) et reprend le catalogue d'options et les sélecteurs de format de [MeTube](https://github.com/alexta69/metube) (AGPL-3.0) : les parties `scripts/ytdl_opts.py` et `src/lib/catalog.ts` en sont dérivées et sont donc distribuées sous **AGPL-3.0**.
