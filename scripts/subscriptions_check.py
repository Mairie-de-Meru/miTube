"""Vérifie les abonnements (chaînes/playlists) et lance un téléchargement pour les nouveautés.

Appelé par subscriptions.yml. Lit/écrit data/subscriptions.json (branche `metube-data`,
éditée par l'interface web via l'API Contents). Pour chaque abonnement échu :
  - liste les N entrées les plus récentes (yt-dlp --flat-playlist) ;
  - à la 1re vérification, mémorise l'existant sans rien télécharger (comme MeTube) ;
  - sinon, lance download.yml avec les nouvelles URL (via la CLI `gh`).

Variables d'environnement : SUBS_FILE (défaut data/subscriptions.json), DRY_RUN=1,
YTDL_OPTIONS (JSON), YTDLP_COOKIES, GH_TOKEN (pour `gh workflow run`), GITHUB_REPOSITORY.
"""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ytdl_opts  # noqa: E402

MAX_SEEN = 500
DEFAULT_SCAN = 20
DEFAULT_INTERVAL_H = 12
MAX_URLS_PER_RUN = 10


def is_due(sub: dict, now: float) -> bool:
    if not sub.get("enabled", True):
        return False
    interval = float(sub.get("intervalHours") or DEFAULT_INTERVAL_H) * 3600
    # marge de 5 min : le cron GitHub dérive de quelques minutes
    return now - float(sub.get("lastChecked") or 0) >= interval - 300


def select_new(entries: list, seen: list, first_run: bool) -> tuple:
    """Renvoie (nouvelles entrées à télécharger, liste `seen` mise à jour)."""
    ids = [e["id"] for e in entries if e.get("id")]
    if first_run:
        return [], (ids + [i for i in seen if i not in ids])[:MAX_SEEN]
    new = [e for e in entries if e.get("id") and e["id"] not in seen]
    merged = ([e["id"] for e in new] + seen)[:MAX_SEEN]
    return new, merged


def entry_url(entry: dict) -> str:
    return entry.get("url") or entry.get("webpage_url") or ""


def list_entries(url: str, scan: int, base: dict, cookie_path) -> list:
    import yt_dlp

    opts = {
        **base,
        "quiet": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
        "playlistend": scan,
        "ignoreerrors": False,
    }
    if cookie_path:
        opts["cookiefile"] = cookie_path
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    return list((info or {}).get("entries") or [])


def dispatch(urls: list, sub: dict, dry_run: bool) -> None:
    req = dict(sub.get("request") or {})
    job_id = f"sub{sub['id'][:12]}{int(time.time())}"
    payload = {**req, "v": 1, "jobId": job_id, "urls": urls}
    ytdl_opts.normalize(payload)  # lève InvalidRequest si l'abonnement est mal formé
    if dry_run:
        print(f"[dry-run] {job_id}: {urls}")
        return
    subprocess.run(
        ["gh", "workflow", "run", "download.yml", "-f", f"job_id={job_id}", "-f", f"payload={json.dumps(payload)}"],
        check=True,
    )


def main() -> int:
    path = Path(os.environ.get("SUBS_FILE", "data/subscriptions.json"))
    dry_run = os.environ.get("DRY_RUN") == "1"
    if not path.exists():
        print("Aucun fichier d'abonnements.")
        return 0
    data = json.loads(path.read_text())
    base = json.loads(os.environ.get("YTDL_OPTIONS") or "{}")
    cookies = os.environ.get("YTDLP_COOKIES", "")
    cookie_path = None
    if cookies.strip():
        fd, cookie_path = tempfile.mkstemp(prefix="cookies-", suffix=".txt")
        with os.fdopen(fd, "w") as fh:
            fh.write(cookies)

    proxy = ytdl_opts.proxy_from_env(os.environ.get("YTDLP_PROXY"))
    if proxy:
        base = {**base, "proxy": proxy}

    now = time.time()
    errors = 0
    try:
        for sub in data.get("subscriptions", []):
            if not is_due(sub, now):
                continue
            try:
                entries = list_entries(sub["url"], int(sub.get("scan") or DEFAULT_SCAN), base, cookie_path)
                first = "lastChecked" not in sub or not sub["lastChecked"]
                new, sub["seen"] = select_new(entries, list(sub.get("seen") or []), first)
                urls = [u for u in (entry_url(e) for e in new) if u][:MAX_URLS_PER_RUN]
                if urls:
                    dispatch(urls, sub, dry_run)
                sub["lastChecked"] = now
                sub["lastError"] = None
                print(f"{sub.get('name') or sub['url']}: {len(urls)} nouveauté(s)" + (" (initialisation)" if first else ""))
            except Exception as exc:  # noqa: BLE001
                errors += 1
                sub["lastError"] = str(exc)[:300]
                sub["lastChecked"] = now
                print(f"ERREUR {sub.get('url')}: {exc}", file=sys.stderr)
    finally:
        if cookie_path:
            os.remove(cookie_path)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
