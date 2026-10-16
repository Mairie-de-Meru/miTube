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

## Mode direct (Worker Cloudflare)

`worker/src/index.ts` (routes `/info`, `/stream`, CORS par `ALLOWED_ORIGINS`) et `worker/src/youtube.ts` (client iOS, analyse de la réponse, liste blanche googlevideo). Contrat partagé dans `worker/src/types.ts`. Côté front : `src/lib/direct.ts` (choix des flux `planDownload`, téléchargement par tranches), `src/lib/mux.ts` (ffmpeg.wasm chargé à la demande depuis jsDelivr), `src/hooks/useDirect.ts` (file séquentielle), `src/components/DirectPanel.tsx`. Réglages : `workerUrl` (défaut `VITE_WORKER_URL`, variable de dépôt `WORKER_URL`) et `mode` (`direct` par défaut). Workflow facultatif `deploy-worker.yml`.
