"""Repli YouTube via l'API d'une instance Invidious (utilisé quand YouTube refuse yt-dlp).

Principe : l'instance parle à YouTube à notre place (son IP n'est pas bloquée comme celle des
serveurs GitHub), renvoie la liste des flux, et on télécharge ces flux puis on les assemble
ou on les convertit avec ffmpeg.

Limites connues : la plupart des instances publiques désactivent leur API ou la protègent par un
anti-bot ; la liste de repli est donc courte et peut devenir inutilisable sans préavis.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

# Liste officielle (api.invidious.io) : seules les instances HTTPS dont l'API répond sont gardées.
# À surcharger avec la variable de dépôt INVIDIOUS_INSTANCES (adresses séparées par espaces ou virgules).
DEFAULT_INSTANCES = ("https://invidious.f5.si",)

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"
CHUNK = 8 * 1024 * 1024
API_TIMEOUT = 25
VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


class InvidiousError(Exception):
    pass


def parse_instances(text: str | None) -> list[str]:
    """Adresses https d'instances, sans doublon ni chemin, dans l'ordre donné."""
    out: list[str] = []
    for raw in re.split(r"[\s,]+", text or ""):
        raw = raw.strip().rstrip("/")
        if not raw:
            continue
        parts = urlsplit(raw)
        if parts.scheme != "https" or not parts.hostname or parts.username or parts.path or parts.query:
            raise InvidiousError(f"instance Invidious invalide (https://hôte attendu) : {raw[:80]!r}")
        base = f"https://{parts.netloc.lower()}"
        if base not in out:
            out.append(base)
    return out


def video_id_from_url(url: str) -> str | None:
    """Identifiant d'une vidéo YouTube (watch, youtu.be, shorts, embed, live), sinon None."""
    parts = urlsplit(url)
    host = (parts.hostname or "").lower()
    segments = [s for s in parts.path.split("/") if s]
    vid = None
    if host == "youtu.be":
        vid = segments[0] if segments else None
    elif host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        if parts.path == "/watch":
            vid = (parse_qs(parts.query).get("v") or [None])[0]
        elif len(segments) >= 2 and segments[0] in ("shorts", "embed", "live", "v"):
            vid = segments[1]
    return vid if vid and VIDEO_ID_RE.match(vid) else None


def _get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=API_TIMEOUT) as resp:  # noqa: S310 (https imposé plus haut)
        if "json" not in (resp.headers.get("Content-Type") or ""):
            raise InvidiousError("réponse non JSON (API désactivée ou anti-bot)")
        return json.loads(resp.read(20 * 1024 * 1024))


def fetch_video(video_id: str, instances: list[str], get_json=_get_json) -> tuple[str, dict]:
    """Interroge les instances dans l'ordre ; renvoie (instance, données) de la première qui répond."""
    errors = []
    for base in instances:
        try:
            data = get_json(f"{base}/api/v1/videos/{video_id}")
            if not isinstance(data, dict) or data.get("error"):
                raise InvidiousError(str((data or {}).get("error", "réponse vide"))[:120])
            if not (data.get("adaptiveFormats") or data.get("formatStreams")):
                raise InvidiousError("aucun flux dans la réponse")
            return base, data
        except Exception as exc:  # noqa: BLE001 - toute panne d'instance autorise la suivante
            errors.append(f"{base} : {str(exc)[:120]}")
    raise InvidiousError("aucune instance Invidious n'a répondu (" + " ; ".join(errors) + ")")


def _height(fmt: dict) -> int:
    m = re.match(r"(\d+)", str(fmt.get("resolution") or fmt.get("qualityLabel") or ""))
    return int(m.group(1)) if m else 0


def _codec(fmt: dict) -> str:
    return str(fmt.get("type") or "")


def _is_h264(fmt: dict) -> bool:
    return "avc1" in _codec(fmt)


def _is_audio(fmt: dict) -> bool:
    return _codec(fmt).startswith("audio/")


def _bitrate(fmt: dict) -> int:
    try:
        return int(fmt.get("bitrate") or 0)
    except (TypeError, ValueError):
        return 0


def _size(fmt: dict) -> int:
    try:
        return int(fmt.get("clen") or 0)
    except (TypeError, ValueError):
        return 0


CODEC_TOKENS = {"h264": "avc1", "h265": "hev1", "av1": "av01", "vp9": "vp9"}


def pick_streams(data: dict, req: dict) -> dict:
    """Choisit les flux pour une requête normalisée (ytdl_opts.normalize).

    Renvoie {"video": fmt|None, "audio": fmt|None, "muxed": fmt|None}.
    """
    adaptive = [f for f in data.get("adaptiveFormats") or [] if f.get("url")]
    audios = sorted((f for f in adaptive if _is_audio(f)), key=_bitrate, reverse=True)
    videos = [f for f in adaptive if not _is_audio(f)]

    if req["type"] == "audio":
        if audios:
            return {"video": None, "audio": audios[0], "muxed": None}
        muxed = [f for f in data.get("formatStreams") or [] if f.get("url")]
        if muxed:
            return {"video": None, "audio": None, "muxed": muxed[0]}
        raise InvidiousError("aucun flux audio disponible")

    quality = req["quality"]
    limit = int(quality) if quality.isdigit() else None
    fmt = req["format"]  # any | mp4 | ios

    def within(fs):
        return [f for f in fs if limit is None or _height(f) <= limit] or sorted(fs, key=_height)[:1]

    token = CODEC_TOKENS.get(req["codec"])
    candidates = videos
    if fmt in ("mp4", "ios"):
        candidates = [f for f in videos if _is_h264(f)] or videos
    elif token:
        candidates = [f for f in videos if token in _codec(f)] or videos
    if candidates and audios:
        pool = within(candidates)
        best_height = max(_height(f) for f in pool)
        top = [f for f in pool if _height(f) == best_height]
        # À hauteur égale : plus fort débit (60 i/s avant 30 i/s).
        video = max(top, key=_bitrate)
        audio = audios[0]
        if fmt in ("mp4", "ios"):
            m4a = [a for a in audios if "mp4a" in _codec(a)]
            audio = m4a[0] if m4a else audio
        return {"video": video, "audio": audio, "muxed": None}
    muxed = sorted((f for f in data.get("formatStreams") or [] if f.get("url")), key=_height, reverse=True)
    if muxed:
        return {"video": None, "audio": None, "muxed": within(muxed)[0] if limit else muxed[0]}
    raise InvidiousError("aucun flux vidéo disponible")


def check_limits(data: dict, req: dict, max_seconds: int, max_bytes: int) -> None:
    """Mêmes plafonds que le filtre public de yt-dlp (direct interdit, durée et taille limitées)."""
    if data.get("liveNow") or data.get("isUpcoming"):
        raise InvidiousError("les directs ne sont pas pris en charge")
    if max_seconds and int(data.get("lengthSeconds") or 0) > max_seconds:
        raise InvidiousError(f"vidéo trop longue (maximum {max_seconds // 3600} h)")


def safe_name(title: str, fallback: str) -> str:
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]', "_", title or "").strip(" .")
    return (name or fallback)[:120]


def _download(url: str, dest: Path, expected: int = 0) -> None:
    """Téléchargement par tranches (googlevideo bride les requêtes sans plage), avec reprises."""
    done = 0
    total = expected
    with open(dest, "wb") as fh:
        while True:
            end = done + CHUNK - 1
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Range": f"bytes={done}-{end}"})
            for attempt in range(4):
                try:
                    with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310
                        crange = resp.headers.get("Content-Range") or ""
                        m = re.search(r"/(\d+)$", crange)
                        if m:
                            total = int(m.group(1))
                        block = resp.read()
                    break
                except urllib.error.HTTPError as exc:
                    if exc.code == 416 and done:  # au-delà de la fin
                        return
                    if attempt == 3:
                        raise InvidiousError(f"téléchargement refusé (HTTP {exc.code})") from exc
                except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
                    if attempt == 3:
                        raise InvidiousError(f"téléchargement interrompu : {exc}") from exc
            if not block:
                break
            fh.write(block)
            done += len(block)
            if total and done >= total:
                break
    if done == 0:
        raise InvidiousError("flux vide")


def _ffmpeg(*args: str) -> None:
    proc = subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", *args], capture_output=True, text=True)
    if proc.returncode != 0:
        raise InvidiousError(f"ffmpeg a échoué : {proc.stderr.strip()[-300:]}")


AUDIO_CODECS = {
    "mp3": (["-c:a", "libmp3lame"], "mp3"),
    "m4a": (["-c:a", "aac"], "m4a"),
    "opus": (["-c:a", "libopus"], "opus"),
    "wav": (["-c:a", "pcm_s16le"], "wav"),
    "flac": (["-c:a", "flac"], "flac"),
}


def build_audio(src: Path, src_fmt: dict, req: dict, dest_base: Path, meta: list[str]) -> Path:
    fmt = req["format"]
    q = req["quality"]
    if fmt == "auto":  # sans conversion : conteneur d'origine
        ext = "m4a" if "mp4a" in _codec(src_fmt) else "webm" if "opus" in _codec(src_fmt) else "m4a"
        dest = dest_base.with_suffix(f".{ext}")
        _ffmpeg("-i", str(src), "-vn", "-c:a", "copy", *meta, str(dest))
        return dest
    codec, ext = AUDIO_CODECS[fmt]
    if fmt == "m4a" and "mp4a" in _codec(src_fmt):
        codec = ["-c:a", "copy"]  # déjà de l'AAC dans du M4A
    elif fmt in ("mp3", "m4a", "opus") and q != "best":
        codec = [*codec, "-b:a", f"{q}k"]
    elif fmt == "mp3":
        codec = [*codec, "-q:a", "0"]
    dest = dest_base.with_suffix(f".{ext}")
    _ffmpeg("-i", str(src), "-vn", *codec, *meta, str(dest))
    return dest


def run_fallback(video_id: str, req: dict, out_dir: Path, instances: list[str], public: bool, log=print) -> dict:
    """Télécharge `video_id` via Invidious dans `out_dir`. Renvoie les infos du résultat."""
    from ytdl_opts import PUBLIC_MAX_FILESIZE  # import local : module partagé avec ytdl_run

    base, data = fetch_video(video_id, instances)
    log(f"[invidious] {video_id} : flux obtenus via {base}")
    check_limits(data, req, 10800 if public else 0, PUBLIC_MAX_FILESIZE if public else 0)
    sel = pick_streams(data, req)
    title = str(data.get("title") or video_id)
    author = str(data.get("author") or "")
    name = safe_name(title, video_id)
    meta = ["-metadata", f"title={title}"] + (["-metadata", f"artist={author}"] if author else [])
    out_dir.mkdir(parents=True, exist_ok=True)
    work = out_dir.parent / "invidious-work"
    work.mkdir(parents=True, exist_ok=True)

    parts = [f for f in (sel["video"], sel["audio"], sel["muxed"]) if f]
    total = sum(_size(f) for f in parts)
    if public and total > PUBLIC_MAX_FILESIZE:
        raise InvidiousError("fichier trop volumineux")

    files = {}
    for key, f in (("video", sel["video"]), ("audio", sel["audio"]), ("muxed", sel["muxed"])):
        if not f:
            continue
        path = work / f"{key}.{(f.get('container') or 'bin')}"
        log(f"[invidious] téléchargement {key} itag {f.get('itag')} {f.get('qualityLabel') or ''}")
        _download(f["url"], path, _size(f))
        files[key] = path

    dest_base = out_dir / name
    if req["type"] == "audio":
        src = files.get("audio") or files["muxed"]
        dest = build_audio(src, sel["audio"] or sel["muxed"], req, dest_base, meta)
    elif "muxed" in files:
        dest = dest_base.with_suffix(".mp4")
        _ffmpeg("-i", str(files["muxed"]), "-c", "copy", *meta, str(dest))
    else:
        mp4_ok = _is_h264(sel["video"]) and "mp4a" in _codec(sel["audio"])
        dest = dest_base.with_suffix(".mp4" if mp4_ok else ".mkv")
        _ffmpeg("-i", str(files["video"]), "-i", str(files["audio"]), "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", *meta, str(dest))
    for p in files.values():
        p.unlink(missing_ok=True)
    return {"title": title, "instance": base, "file": dest.name, "bytes": dest.stat().st_size}


def instances_from_env(extra: str | None = None) -> list[str]:
    """INVIDIOUS_INSTANCES (variable de dépôt) puis, à défaut, la liste intégrée."""
    return parse_instances(extra or os.environ.get("INVIDIOUS_INSTANCES")) or list(DEFAULT_INSTANCES)
