# miTube

Colle un lien YouTube, choisis le format (vidéo MP4 ou **MP3**), télécharge. Aucun compte, aucun jeton à saisir pour l'utilisateur final.

Site : <https://mairie-de-meru.github.io/miTube/> · Dérivé de [MeTube](https://github.com/alexta69/metube), voir « Licence et crédits ».

## Comment ça marche

- Le site est une page statique (React) sur **GitHub Pages**, sans serveur.
- Le téléchargement est fait par **yt-dlp dans GitHub Actions** (les serveurs de GitHub). La page lance la tâche, attend, puis te donne le fichier. Compte environ une minute.
- Pour lancer une tâche, la page doit s'authentifier auprès de GitHub. Un **jeton à droits minimaux est intégré au site au moment de sa publication** : le visiteur n'a rien à saisir.
- Seuls les liens **YouTube** sont acceptés, une vidéo par lien (pas de playlist), 3 h et 2 Go maximum, 5 liens à la fois. Ces limites sont appliquées **côté GitHub Actions** (`scripts/ytdl_opts.py`), pas seulement dans la page, car le jeton est lisible par tous.

## Mise en service (administrateur, une fois par an)

1. **Pages** : *Settings → Pages → Source : GitHub Actions* (déjà fait pour ce dépôt).
2. **Crée le jeton** avec [ce lien prérempli](https://github.com/settings/personal-access-tokens/new?name=miTube&description=Lance+et+lit+les+t%C3%A9l%C3%A9chargements+miTube+%28GitHub+Actions%29&expires_in=365&actions=write&target_name=Mairie-de-Meru). Vérifie :
   - *Resource owner* : **Mairie-de-Meru** ;
   - *Repository access* : **Only select repositories** → **miTube** uniquement ;
   - *Repository permissions* : **Actions : Read and write** (et *Metadata : Read*, automatique). **Rien d'autre.**
   - Si l'organisation demande l'approbation des jetons à granularité fine, un propriétaire doit l'approuver (*Settings de l'organisation → Personal access tokens*).
3. **Enregistre-le** : dépôt → *Settings → Secrets and variables → Actions → New repository secret*, nom **`PUBLIC_TOKEN`**.
4. **Publie** : onglet *Actions → Deploy to GitHub Pages → Run workflow*. Le jeton est injecté dans le site au build.
5. **Renouvelle chaque année** (durée maximale d'un jeton fin : 1 an) : recrée un jeton, remplace le secret, relance la publication.

Ne mets **jamais** le jeton dans le code : GitHub révoque automatiquement les jetons détectés dans un dépôt public. Le secret `PUBLIC_TOKEN` ne sort que dans le site publié.

### Ce que peut faire (et ne pas faire) ce jeton public

Le jeton est visible par quiconque lit le code JavaScript du site. Avec *Actions : Read and write* sur le seul dépôt miTube, il peut : lancer, annuler et supprimer des exécutions, lire et supprimer des artefacts. Il **ne peut pas** : pousser du code, modifier les workflows, lire les secrets, changer les réglages, toucher un autre dépôt.

Risques résiduels, sans embellir :

| Risque | Mesure |
|---|---|
| Quelqu'un lance beaucoup de tâches avec le jeton | Minutes Actions illimitées et gratuites en dépôt public ; en cas d'abus, révoquer le jeton (le site se bloque jusqu'au remplacement du secret). Les yt-dlp lancés sont bornés (YouTube seul, 3 h, 2 Go, pas d'options libres). |
| Quelqu'un lit les téléchargements des autres | Dépôt public : les artefacts et journaux (donc les liens téléchargés) sont lisibles par tout compte GitHub qui connaît leur identifiant. Les fichiers sont supprimés après `RETENTION_DAYS` (7 jours par défaut). Chaque visiteur ne voit dans la page que ses propres téléchargements. **Ne pas utiliser pour du contenu privé.** |
| Quelqu'un supprime les téléchargements des autres | Possible techniquement avec le jeton. Sans conséquence grave : il suffit de relancer. |
| Quota de stockage Actions (500 Mo en compte gratuit) | Les artefacts sont supprimés par le visiteur ou expirent. Réduire `RETENTION_DAYS` si le quota est atteint. |

## Limites

- **YouTube bloque une partie des vidéos depuis les serveurs GitHub** (IP de datacenter). Test du 15/10/2026 : OK. Test du 16/10/2026 sur ce dépôt : une vidéo très populaire passe, deux autres sont refusées (« Sign in to confirm you're not a bot ») avec dix clients YouTube différents et même avec un fournisseur de PO token. La seule parade fiable est d'ajouter des **cookies** (secret `YTDLP_COOKIES`, voir plus bas) ou d'utiliser un runner auto-hébergé sur une connexion résidentielle.
- **Conditions d'utilisation** : celles d'Actions réservent le service aux projets logiciels ; télécharger des médias est une zone grise. Usage modéré et à tes risques. Respecte les conditions de YouTube et le droit d'auteur.
- **Pas de progression en pourcentage** : GitHub ne donne que l'état (en attente / en cours / terminé).
- **Fichiers temporaires** : ce sont des artefacts (zip) conservés quelques jours, pas un dossier permanent.

## Réglages (administrateur)

*Settings → Secrets and variables → Actions → Variables* :

| Variable | Rôle | Défaut |
|---|---|---|
| `RETENTION_DAYS` | Jours de conservation des fichiers (1 à 90) | `7` |
| `YTDLP_CHANNEL` | `stable` ou `nightly` | `stable` |
| `YTDL_OPTIONS` | Options yt-dlp globales (JSON), de confiance : réservées à l'administrateur | vide |
| `PUBLIC_MODE` | `0` désactive les restrictions publiques (autres sites, playlists, options libres) côté Actions | actif |
| `BASE_PATH` | Chemin de base du site, cas particulier | relatif |

**Cookies (facultatif)** : exporte tes cookies au format Netscape depuis un compte secondaire (extension « Get cookies.txt LOCALLY »), puis crée le secret `YTDLP_COOKIES` avec le contenu du fichier. Ils ne passent jamais par le site ni par les artefacts.

### Mode administrateur (interface complète)

Si le site est construit **sans** `PUBLIC_TOKEN`, il redemande un jeton à la première visite et affiche l'interface complète héritée de MeTube (tous les formats, playlists, sous-titres, miniatures, options avancées, abonnements). Pour l'utiliser, mets la variable `PUBLIC_MODE` à `0` : sans cela le moteur refuse tout ce qui sort du cadre public. Les abonnements demandent en plus *Contents : Read and write* sur le jeton : ne **jamais** donner ce droit au jeton public.

## Développement

```bash
npm install
npm run dev        # http://localhost:5173
npm run lint && npm test && npm run build
python3 -m unittest discover -s tests   # logique côté Actions
```

Pour essayer le mode public en local : `VITE_PUBLIC_TOKEN=<jeton> VITE_PUBLIC_REPO=Mairie-de-Meru/miTube npm run dev`.

- `src/` : application React + TypeScript (Vite). `src/lib/simple.ts` et `src/components/SimpleForm.tsx` : interface publique ; `src/lib/publicConfig.ts` : jeton embarqué.
- `scripts/` : ce qui s'exécute dans Actions (`ytdl_opts.py` : validation + options yt-dlp, port de `dl_formats.py` de MeTube ; `ytdl_run.py` ; `subscriptions_check.py`).
- `.github/workflows/` : `download.yml` (moteur), `deploy-pages.yml`, `subscriptions.yml`, `ci.yml`.

## Licence et crédits

Projet indépendant, non affilié à MeTube ni à yt-dlp. Il s'appuie sur [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Unlicense) et reprend le catalogue d'options et les sélecteurs de format de [MeTube](https://github.com/alexta69/metube) (AGPL-3.0) : les parties `scripts/ytdl_opts.py` et `src/lib/catalog.ts` en sont dérivées et sont donc distribuées sous **AGPL-3.0**.
