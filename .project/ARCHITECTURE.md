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
