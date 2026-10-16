"""Traduit une requête MeTube Pages (payload JSON) en options yt-dlp.

Port de app/dl_formats.py de MeTube (alexta69/metube) : mêmes sélecteurs de
format, mêmes post-processeurs. Aucune dépendance en dehors de la bibliothèque
standard, pour pouvoir être testé sans yt-dlp.
"""

import copy
import re
from urllib.parse import urlsplit

import invidious

VIDEO_QUALITIES = ("best", "2160", "1440", "1080", "720", "480", "360", "240", "worst")
VIDEO_FORMATS = ("any", "mp4", "ios")
CODECS = ("auto", "h264", "h265", "av1", "vp9")
AUDIO_FORMATS = ("auto", "m4a", "mp3", "opus", "wav", "flac")
AUDIO_TAGS = ("with_cover", "no_cover", "none")
CAPTION_FORMATS = ("srt", "txt", "vtt", "ttml", "sbv", "scc", "dfxp")
CAPTION_MODES = ("prefer_manual", "prefer_auto", "manual_only", "auto_only")
TYPES = ("video", "audio", "captions", "thumbnail")
LANGUAGE_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]{0,34}$")
JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{4,64}$")

CODEC_FILTER_MAP = {
    "h264": "[vcodec~='^(h264|avc)']",
    "h265": "[vcodec~='^(h265|hevc)']",
    "av1": "[vcodec~='^av0?1']",
    "vp9": "[vcodec~='^vp0?9']",
}

_AUTO_AUDIO_TAGGABLE = "wav>flac/aiff>flac/wma>mp3/best"
_AUTO_AUDIO_AS_SERVED = "/".join(
    f"{ext}>best"
    for ext in ("mp4", "m4v", "mov", "mkv", "flv", "avi", "3gp", "wmv", "mpg", "ogv")
)

# Options yt-dlp qui écrivent hors du dossier de sortie ou fuient des secrets.
FORBIDDEN_OPTS = {"cookiefile", "outtmpl", "paths", "cachedir", "config_locations"}


class InvalidRequest(ValueError):
    pass


def _choice(value, allowed, default, name):
    value = default if value in (None, "") else str(value).strip().lower()
    if value not in allowed:
        raise InvalidRequest(f"{name} invalide : {value!r}")
    return value


# Mode public : le jeton de l'interface est lisible par tous, donc le workflow
# n'accepte que ce que l'interface simple peut produire.
PUBLIC_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"}
PUBLIC_MAX_URLS = 5
PUBLIC_TYPES = ("video", "audio")
# Pas de direct ni de vidéo de plus de 3 h (yt-dlp : filtre sur les métadonnées).
PUBLIC_MATCH_FILTER = "!is_live & duration <=? 10800"
PUBLIC_MAX_FILESIZE = 2 * 1024**3


def is_public_url(url: str) -> bool:
    parts = urlsplit(url)
    return parts.scheme == "https" and (parts.hostname or "").lower() in PUBLIC_HOSTS and not parts.username


def normalize(payload: dict, public: bool = False) -> dict:
    """Valide le payload et complète les valeurs par défaut.

    public=True : YouTube seulement, vidéo ou audio, une vidéo par adresse, options libres ignorées.
    """
    if not isinstance(payload, dict) or payload.get("v") != 1:
        raise InvalidRequest("payload absent ou version inconnue")
    job_id = str(payload.get("jobId", ""))
    if not JOB_ID_RE.match(job_id):
        raise InvalidRequest("jobId invalide")
    urls = payload.get("urls")
    if not isinstance(urls, list) or not urls or len(urls) > 50:
        raise InvalidRequest("urls : 1 à 50 adresses attendues")
    clean_urls = []
    for u in urls:
        u = str(u).strip()
        if not re.match(r"^https?://\S+$", u):
            raise InvalidRequest(f"adresse invalide : {u[:80]!r}")
        clean_urls.append(u)

    if public:
        if len(clean_urls) > PUBLIC_MAX_URLS:
            raise InvalidRequest(f"au plus {PUBLIC_MAX_URLS} adresses par demande")
        for u in clean_urls:
            if not is_public_url(u):
                raise InvalidRequest(f"seules les adresses YouTube (https) sont acceptées : {u[:80]!r}")

    dtype = _choice(payload.get("type"), PUBLIC_TYPES if public else TYPES, "video", "type")
    out = {
        "jobId": job_id,
        "urls": clean_urls,
        "type": dtype,
        "format": "any",
        "quality": "best",
        "codec": "auto",
        "audioTags": "with_cover",
        "subtitleMode": "prefer_manual",
        "subtitleLanguage": "en",
        "playlistLimit": 0,
        "splitChapters": bool(payload.get("splitChapters", False)),
        "outputTemplate": "",
        "ytdlOptions": {},
    }
    if dtype == "video":
        out["format"] = _choice(payload.get("format"), VIDEO_FORMATS, "any", "format")
        out["quality"] = _choice(payload.get("quality"), VIDEO_QUALITIES, "best", "quality")
        out["codec"] = _choice(payload.get("codec"), CODECS, "auto", "codec")
    elif dtype == "audio":
        out["format"] = _choice(payload.get("format"), AUDIO_FORMATS, "m4a", "format")
        quality = str(payload.get("quality") or "best").lower()
        if quality != "best" and not quality.isdigit():
            raise InvalidRequest("quality audio invalide")
        out["quality"] = quality
        out["audioTags"] = _choice(payload.get("audioTags"), AUDIO_TAGS, "with_cover", "audioTags")
    elif dtype == "captions":
        out["format"] = _choice(payload.get("format"), CAPTION_FORMATS, "srt", "format")
        out["subtitleMode"] = _choice(
            payload.get("subtitleMode"), CAPTION_MODES, "prefer_manual", "subtitleMode"
        )
        lang = str(payload.get("subtitleLanguage") or "en").strip()
        if not LANGUAGE_RE.match(lang):
            raise InvalidRequest("langue de sous-titres invalide")
        out["subtitleLanguage"] = lang
    else:
        out["format"] = "jpg"

    if public:
        out["splitChapters"] = False
        out["noPlaylist"] = True
        out["invidiousInstances"] = []
        return out

    limit = payload.get("playlistLimit", 0)
    if not isinstance(limit, int) or isinstance(limit, bool) or not 0 <= limit <= 10000:
        raise InvalidRequest("playlistLimit invalide")
    out["playlistLimit"] = limit

    tmpl = str(payload.get("outputTemplate") or "").strip()
    if tmpl:
        # reste dans le dossier de sortie : pas de chemin absolu ni de ..
        if tmpl.startswith(("/", "~")) or ".." in tmpl.replace("\\", "/").split("/"):
            raise InvalidRequest("outputTemplate doit rester dans le dossier de sortie")
        out["outputTemplate"] = tmpl

    extra = payload.get("ytdlOptions") or {}
    if not isinstance(extra, dict):
        raise InvalidRequest("ytdlOptions doit être un objet JSON")
    bad = FORBIDDEN_OPTS.intersection(extra)
    if bad:
        raise InvalidRequest(f"options yt-dlp interdites : {', '.join(sorted(bad))}")
    out["ytdlOptions"] = extra
    out["noPlaylist"] = False
    # Instances Invidious proposées par l'interface administrateur (jamais en mode public).
    try:
        out["invidiousInstances"] = invidious.parse_instances(" ".join(payload.get("invidiousInstances") or []))
    except (invidious.InvidiousError, TypeError) as exc:
        raise InvalidRequest(str(exc)) from exc
    return out


def get_format(req: dict) -> str:
    dtype, fmt, codec, quality = req["type"], req["format"], req["codec"], req["quality"]
    if dtype in ("thumbnail", "captions"):
        return "bestaudio/best"
    if dtype == "audio":
        return "bestaudio/best" if fmt == "auto" else f"bestaudio[ext={fmt}]/bestaudio/best"
    vfmt, afmt = ("[ext=mp4]", "[ext=m4a]") if fmt in ("mp4", "ios") else ("", "")
    vres = f"[height<={quality}]" if quality not in ("best", "worst") else ""
    vcombo = vres + vfmt
    if fmt == "ios":
        return (
            f"bestvideo[vcodec~='^((he|a)vc|h26[45])']{vres}+bestaudio[acodec=aac]/"
            f"bestvideo[vcodec~='^((he|a)vc|h26[45])']{vres}+bestaudio{afmt}/"
            f"bestvideo{vcombo}+bestaudio{afmt}/best{vcombo}"
        )
    cf = CODEC_FILTER_MAP.get(codec, "")
    if cf:
        return (
            f"bestvideo{cf}{vcombo}+bestaudio{afmt}/"
            f"bestvideo{vcombo}+bestaudio{afmt}/best{vcombo}"
        )
    return f"bestvideo{vcombo}+bestaudio{afmt}/best{vcombo}"


def get_opts(req: dict, base: dict) -> dict:
    """Options yt-dlp complètes (hors sortie/cookies) pour la requête."""
    opts = copy.deepcopy(base)
    opts.update(req["ytdlOptions"])
    opts["format"] = get_format(req)
    if req.get("noPlaylist"):
        opts.update(noplaylist=True, max_filesize=PUBLIC_MAX_FILESIZE)
        opts["match_filter"] = PUBLIC_MATCH_FILTER  # converti en fonction par ytdl_run (yt-dlp l'exige)
    dtype, fmt, quality = req["type"], req["format"], req["quality"]
    pps = []

    if dtype == "audio":
        tags = req["audioTags"]
        if fmt == "auto":
            codec = _AUTO_AUDIO_AS_SERVED if tags == "none" else _AUTO_AUDIO_TAGGABLE
        else:
            codec = fmt
        pps.append(
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": codec,
                "preferredquality": 0 if quality == "best" else quality,
            }
        )
        if fmt != "wav" and tags != "none" and "writethumbnail" not in opts:
            if tags == "with_cover":
                opts["writethumbnail"] = True
                pps.append({"key": "FFmpegThumbnailsConvertor", "format": "jpg", "when": "before_dl"})
            pps.append({"key": "FFmpegMetadata"})
            if tags == "with_cover":
                pps.append({"key": "EmbedThumbnail"})

    if dtype == "thumbnail":
        opts["skip_download"] = True
        opts["writethumbnail"] = True
        pps.append({"key": "FFmpegThumbnailsConvertor", "format": "jpg", "when": "before_dl"})

    if dtype == "captions":
        mode, lang = req["subtitleMode"], req["subtitleLanguage"]
        opts["skip_download"] = True
        sub_fmt = "srt" if fmt == "txt" else fmt
        opts["subtitlesformat"] = f"{sub_fmt}/best"
        if sub_fmt in ("srt", "vtt"):
            pps.append({"key": "FFmpegSubtitlesConvertor", "format": sub_fmt, "when": "before_dl"})
        if mode == "manual_only":
            opts.update(writesubtitles=True, writeautomaticsub=False, subtitleslangs=[lang])
        elif mode == "auto_only":
            opts.update(writesubtitles=False, writeautomaticsub=True, subtitleslangs=[f"{lang}-orig", lang])
        elif mode == "prefer_auto":
            opts.update(writesubtitles=True, writeautomaticsub=True, subtitleslangs=[f"{lang}-orig", lang])
        else:
            opts.update(writesubtitles=True, writeautomaticsub=True, subtitleslangs=[lang, f"{lang}-orig"])

    if req["splitChapters"] and dtype in ("video", "audio"):
        pps.append({"key": "FFmpegSplitChapters", "force_keyframes": False})

    if req["playlistLimit"]:
        opts["playlistend"] = req["playlistLimit"]

    opts["postprocessors"] = pps + list(opts.get("postprocessors", []))
    return opts


def output_template(req: dict, is_playlist: bool) -> str:
    if req["outputTemplate"]:
        return req["outputTemplate"]
    if is_playlist:
        return "%(playlist_title|Playlist)s/%(playlist_index)s - %(title)s.%(ext)s"
    return "%(title)s.%(ext)s"


BOT_CHECK_HINT = (
    "YouTube bloque les serveurs GitHub pour cette vidéo (« confirmez que vous n'êtes pas un robot »). "
    "L'administrateur peut y remédier en ajoutant des cookies (secret YTDLP_COOKIES, voir le README)."
)


def is_bot_check(message: str) -> bool:
    return "not a bot" in message or "LOGIN_REQUIRED" in message


def explain_error(message: str) -> str:
    """Message d'erreur lisible pour l'interface (le détail technique reste dans le journal du run)."""
    if "confirm you" in message and "not a bot" in message:
        return BOT_CHECK_HINT
    return message
