"""Exécute une demande de téléchargement MeTube Pages (appelé par download.yml).

Entrées (variables d'environnement) :
  PAYLOAD          JSON de la requête (voir ytdl_opts.normalize)
  YTDL_OPTIONS     JSON d'options yt-dlp globales (variable de dépôt, facultatif)
  YTDLP_COOKIES    contenu cookies.txt Netscape (secret de dépôt, facultatif)
  OUT_DIR          dossier de sortie (défaut : out)

Écrit les fichiers dans OUT_DIR et un résumé dans OUT_DIR/../metube-result/result.json.
Sort avec un code non nul si tout a échoué.
"""

import json
import os
import sys
import tempfile
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import ytdl_opts  # noqa: E402


def main() -> int:
    out_dir = Path(os.environ.get("OUT_DIR", "out")).resolve()
    meta_dir = out_dir.parent / "metube-result"
    out_dir.mkdir(parents=True, exist_ok=True)
    meta_dir.mkdir(parents=True, exist_ok=True)
    result = {"jobId": None, "ok": False, "items": [], "files": [], "error": None}

    def finish(code: int) -> int:
        (meta_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
        return code

    try:
        req = ytdl_opts.normalize(json.loads(os.environ["PAYLOAD"]))
        result["jobId"] = req["jobId"]
        result["request"] = {k: req[k] for k in ("urls", "type", "format", "quality", "codec")}
        base = json.loads(os.environ.get("YTDL_OPTIONS") or "{}")
        if not isinstance(base, dict):
            raise ytdl_opts.InvalidRequest("YTDL_OPTIONS doit être un objet JSON")
    except Exception as exc:  # noqa: BLE001
        result["error"] = f"Requête invalide : {exc}"
        print(result["error"], file=sys.stderr)
        return finish(2)

    import yt_dlp  # importé tard : les tests de ytdl_opts n'en ont pas besoin

    cookies = os.environ.get("YTDLP_COOKIES", "")
    cookie_path = None
    if cookies.strip():
        fd, cookie_path = tempfile.mkstemp(prefix="cookies-", suffix=".txt")
        with os.fdopen(fd, "w") as fh:
            fh.write(cookies)

    failures = 0
    try:
        for url in req["urls"]:
            opts = ytdl_opts.get_opts(req, base)
            opts.update(quiet=False, noprogress=True, ignoreerrors=False, windowsfilenames=True)
            if cookie_path:
                opts["cookiefile"] = cookie_path
            try:
                # 1) métadonnées seules, pour savoir si c'est une playlist
                probe_opts = {**opts, "skip_download": True, "extract_flat": "in_playlist", "postprocessors": []}
                with yt_dlp.YoutubeDL(probe_opts) as probe:
                    info = probe.extract_info(url, download=False)
                is_playlist = bool(info) and info.get("_type") in ("playlist", "multi_video")
                opts["outtmpl"] = {"default": ytdl_opts.output_template(req, is_playlist)}
                if req["splitChapters"]:
                    opts["outtmpl"]["chapter"] = (
                        "%(title)s - %(section_number)03d %(section_title)s.%(ext)s"
                    )
                opts["paths"] = {"home": str(out_dir)}
                with yt_dlp.YoutubeDL(opts) as ydl:
                    ydl.download([url])
                result["items"].append(
                    {
                        "url": url,
                        "title": (info or {}).get("title"),
                        "isPlaylist": is_playlist,
                        "entries": len((info or {}).get("entries") or []) if is_playlist else 1,
                        "ok": True,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                failures += 1
                traceback.print_exc()
                result["items"].append({"url": url, "ok": False, "error": str(exc)[:500]})
    finally:
        if cookie_path:
            os.remove(cookie_path)

    for path in sorted(p for p in out_dir.rglob("*") if p.is_file()):
        result["files"].append({"name": str(path.relative_to(out_dir)), "size": path.stat().st_size})
    result["ok"] = failures == 0
    if failures:
        result["error"] = "; ".join(i.get("error", "") for i in result["items"] if not i["ok"])[:800]
    return finish(0 if (not failures or result["files"]) else 1)


if __name__ == "__main__":
    sys.exit(main())
