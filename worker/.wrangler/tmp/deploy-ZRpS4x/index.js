var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/youtube.ts
var IOS_VERSION = "20.10.4";
var IOS_UA = `com.google.ios.youtube/${IOS_VERSION} (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)`;
var ID_RE = /^[\w-]{11}$/;
function parseVideoId(input) {
  const s = input.trim();
  if (ID_RE.test(s)) return s;
  let url;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, kind, second] = url.pathname.split("/");
    if (kind === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(kind ?? "")) id = second ?? null;
  }
  return id && ID_RE.test(id) ? id : null;
}
__name(parseVideoId, "parseVideoId");
function isAllowedStreamUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.port && !url.username && /^[a-z0-9-]+(\.[a-z0-9-]+)*\.googlevideo\.com$/i.test(url.hostname);
}
__name(isAllowedStreamUrl, "isAllowedStreamUrl");
function mapFormat(f, muxed) {
  const m = /^(video|audio)\/(\w+);\s*codecs="([^"]+)"/.exec(f.mimeType ?? "");
  if (!m || !f.url || typeof f.itag !== "number") return null;
  if (f.audioTrack && f.audioTrack.audioIsDefault === false) return null;
  const [, type, container, codecs] = m;
  const ext = type === "audio" ? container === "mp4" ? "m4a" : container : container;
  return {
    itag: f.itag,
    kind: muxed ? "muxed" : type,
    ext: ext ?? "mp4",
    codec: (codecs ?? "").split(",")[0].trim(),
    height: f.height ?? 0,
    fps: f.fps ?? 0,
    bitrate: f.bitrate ?? 0,
    size: Number(f.contentLength) || 0,
    url: f.url
  };
}
__name(mapFormat, "mapFormat");
var YouTubeError = class extends Error {
  static {
    __name(this, "YouTubeError");
  }
  reason;
  constructor(message, reason) {
    super(message);
    this.reason = reason;
  }
};
function parsePlayerResponse(data, id) {
  const status = data.playabilityStatus?.status;
  if (status !== "OK") {
    throw new YouTubeError(status ?? "UNKNOWN", data.playabilityStatus?.reason);
  }
  const sd = data.streamingData;
  const formats = [
    ...(sd?.formats ?? []).map((f) => mapFormat(f, true)),
    ...(sd?.adaptiveFormats ?? []).map((f) => mapFormat(f, false))
  ].filter((f) => f !== null);
  if (formats.length === 0) throw new YouTubeError("NO_FORMATS", "No downloadable format returned");
  const d = data.videoDetails;
  const thumbs = d?.thumbnail?.thumbnails ?? [];
  return {
    id,
    title: d?.title ?? id,
    author: d?.author ?? "",
    lengthSeconds: Number(d?.lengthSeconds) || 0,
    thumbnail: thumbs[thumbs.length - 1]?.url ?? "",
    formats
  };
}
__name(parsePlayerResponse, "parsePlayerResponse");
async function fetchInfo(id, fetcher = fetch) {
  const res = await fetcher("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": IOS_UA },
    body: JSON.stringify({
      videoId: id,
      contentCheckOk: true,
      racyCheckOk: true,
      context: {
        client: {
          clientName: "IOS",
          clientVersion: IOS_VERSION,
          hl: "en",
          deviceMake: "Apple",
          deviceModel: "iPhone16,2",
          osName: "iPhone",
          osVersion: "18.3.2.22D82"
        }
      }
    })
  });
  if (!res.ok) throw new YouTubeError(`HTTP_${res.status}`, `YouTube answered ${res.status}`);
  return parsePlayerResponse(await res.json(), id);
}
__name(fetchInfo, "fetchInfo");

// src/index.ts
var DEFAULT_ORIGINS = ["http://localhost:5173", "http://localhost:4173", "http://127.0.0.1:5173"];
function allowedOrigins(env) {
  const extra = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean);
  return [...extra, ...DEFAULT_ORIGINS];
}
__name(allowedOrigins, "allowedOrigins");
function cors(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "range",
    "access-control-expose-headers": "content-length, content-range, accept-ranges, content-type",
    "access-control-max-age": "86400",
    vary: "origin"
  };
}
__name(cors, "cors");
function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
}
__name(json, "json");
async function handle(req, env, fetcher = fetch) {
  const origin = req.headers.get("origin") ?? "";
  if (!allowedOrigins(env).includes(origin)) {
    return json({ error: "FORBIDDEN_ORIGIN", reason: "This origin is not allowed (see ALLOWED_ORIGINS)." }, 403, {});
  }
  const h = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405, h);
  const url = new URL(req.url);
  if (url.pathname === "/info") {
    const id = parseVideoId(url.searchParams.get("v") ?? "");
    if (!id) return json({ error: "INVALID_URL", reason: "Not a YouTube video URL." }, 400, h);
    try {
      return json(await fetchInfo(id, fetcher), 200, h);
    } catch (e) {
      if (e instanceof YouTubeError) return json({ error: e.message, reason: e.reason }, 422, h);
      return json({ error: "UPSTREAM", reason: e instanceof Error ? e.message : String(e) }, 502, h);
    }
  }
  if (url.pathname === "/stream") {
    const target = url.searchParams.get("u") ?? "";
    if (!isAllowedStreamUrl(target)) return json({ error: "INVALID_STREAM_URL" }, 400, h);
    const headers = { "user-agent": IOS_UA };
    const range = req.headers.get("range");
    if (range) headers.range = range;
    const upstream = await fetcher(target, { headers });
    const out = new Headers(h);
    for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const v = upstream.headers.get(k);
      if (v) out.set(k, v);
    }
    out.set("cache-control", "no-store");
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }
  return json({ error: "NOT_FOUND" }, 404, h);
}
__name(handle, "handle");
var index_default = { fetch: /* @__PURE__ */ __name((req, env) => handle(req, env), "fetch") };
export {
  allowedOrigins,
  index_default as default,
  handle
};
//# sourceMappingURL=index.js.map
