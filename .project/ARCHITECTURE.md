# Architecture

```
Navigateur (GitHub Pages, React/Vite, base './')
  │  jeton fin (localStorage/sessionStorage), api.github.com uniquement
  ├─ POST /actions/workflows/download.yml/dispatches {job_id, payload}
  ├─ GET  /actions/workflows/download.yml/runs      → file d'attente (display_title = "metube <job_id>")
  ├─ GET  /actions/artifacts                         → fichiers (metube-<id>) et résumé (metube-<id>-meta)
  ├─ GET  /actions/artifacts/{id}/zip → unzip (fflate) → liens de téléchargement blob:
  └─ POST cancel / DELETE run + artifact
GitHub Actions (download.yml) : checkout → Python+Deno+ffmpeg → pip yt-dlp → scripts/ytdl_run.py → upload-artifact
GitHub Actions (subscriptions.yml, cron 6 h) : data/subscriptions.json (branche metube-data) → nouveautés → gh workflow run download.yml
```

- `src/lib/catalog.ts` ↔ `scripts/ytdl_opts.py` : mêmes options, à garder alignés.
- `src/lib/jobs.ts` : fusion runs + artefacts + envois locaux → liste de jobs (sending/queued/running/done/failed/cancelled/expired).
- Tests : vitest (`src/**/*.test.ts`), unittest (`tests/`).

## Mode public (miTube)

Build avec `VITE_PUBLIC_TOKEN` (secret `PUBLIC_TOKEN`, droits : Actions du seul dépôt) → `IS_PUBLIC` : jeton embarqué, dépôt déduit de l'URL github.io, `SimpleForm` (lien YouTube + format MP4/MP3/M4A), pas de réglages ni d'abonnements, liste limitée aux téléchargements lancés depuis ce navigateur (`buildJobs(..., onlyLocal)`). Sans jeton embarqué : mode administrateur (accueil + interface complète).

Le jeton étant public, la validation décisive est côté Actions : `ytdl_opts.normalize(payload, public=True)` (variable `PUBLIC_MODE`, actif par défaut) n'accepte que des liens `https` YouTube (5 max), vidéo/audio, ignore `ytdlOptions`/`outputTemplate`/playlist/chapitres, et `get_opts` ajoute `noplaylist`, `max_filesize` 2 Go et un filtre de métadonnées (hors direct, ≤ 3 h).

Repli Invidious : `scripts/invidious.py` (API `/api/v1/videos/<id>`, plusieurs instances, ffmpeg) appelé par `ytdl_run.py` quand yt-dlp échoue sur le contrôle anti-bot ; instances via `INVIDIOUS_INSTANCES` ou `payload.invidiousInstances` (admin seulement).
