import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import invidious as inv  # noqa: E402
import ytdl_opts as y  # noqa: E402


def fmt(itag, typ, label=None, bitrate=1, clen=100, container="mp4"):
    return {
        "itag": str(itag), "type": typ, "qualityLabel": label, "resolution": label[:4] if label and label.endswith("p") else (label or "")[:4] or None,
        "bitrate": str(bitrate), "clen": str(clen), "container": container, "url": f"https://g/{itag}",
    }


DATA = {
    "title": "Titre: test/1", "author": "Moi", "lengthSeconds": 100, "liveNow": False,
    "adaptiveFormats": [
        fmt(140, 'audio/mp4; codecs="mp4a.40.2"', None, 131000, container="m4a"),
        fmt(251, 'audio/webm; codecs="opus"', None, 148000, container="webm"),
        fmt(135, 'video/mp4; codecs="avc1.4D401F"', "480p", 1000000),
        fmt(136, 'video/mp4; codecs="avc1.64001F"', "720p", 2000000),
        fmt(298, 'video/mp4; codecs="avc1.640020"', "720p60", 3000000),
        fmt(247, 'video/webm; codecs="vp9"', "720p", 2100000, container="webm"),
        fmt(299, 'video/mp4; codecs="avc1.64002A"', "1080p60", 5000000),
        fmt(401, 'video/mp4; codecs="av01.0.13M.08"', "2160p60", 23000000),
    ],
    "formatStreams": [fmt(18, 'video/mp4; codecs="avc1.42001E, mp4a.40.2"', "360p")],
}


def req(**kw):
    base = {"v": 1, "jobId": "abcd1234", "urls": ["https://youtu.be/dQw4w9WgXcQ"]}
    base.update(kw)
    return y.normalize(base)


class InstancesTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(inv.parse_instances("https://A.example/, https://b.example https://a.example"), ["https://a.example", "https://b.example"])
        self.assertEqual(inv.parse_instances(""), [])

    def test_rejects_non_https_or_path(self):
        for bad in ("http://a.example", "https://a.example/x", "https://u@a.example", "a.example", "https://a.example?q=1"):
            with self.assertRaises(inv.InvidiousError, msg=bad):
                inv.parse_instances(bad)

    def test_admin_payload_instances_validated_and_public_ignored(self):
        r = req(invidiousInstances=["https://a.example"])
        self.assertEqual(r["invidiousInstances"], ["https://a.example"])
        with self.assertRaises(y.InvalidRequest):
            req(invidiousInstances=["http://a.example"])
        p = y.normalize({"v": 1, "jobId": "abcd1234", "urls": ["https://youtu.be/dQw4w9WgXcQ"], "invidiousInstances": ["https://a.example"]}, public=True)
        self.assertEqual(p["invidiousInstances"], [])


class VideoIdTests(unittest.TestCase):
    def test_ids(self):
        v = "dQw4w9WgXcQ"
        for u in (f"https://www.youtube.com/watch?v={v}&t=3", f"https://youtu.be/{v}", f"https://music.youtube.com/watch?v={v}",
                  f"https://www.youtube.com/shorts/{v}", f"https://www.youtube.com/embed/{v}"):
            self.assertEqual(inv.video_id_from_url(u), v, u)

    def test_none(self):
        for u in ("https://example.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/playlist?list=PL1", "https://www.youtube.com/watch?v=court"):
            self.assertIsNone(inv.video_id_from_url(u), u)


class FetchTests(unittest.TestCase):
    def test_falls_back_to_next_instance(self):
        calls = []

        def get(url):
            calls.append(url)
            if "bad" in url:
                raise inv.InvidiousError("API désactivée")
            return DATA

        base, data = inv.fetch_video("dQw4w9WgXcQ", ["https://bad.example", "https://good.example"], get)
        self.assertEqual(base, "https://good.example")
        self.assertEqual(len(calls), 2)

    def test_all_fail(self):
        def get(url):
            raise inv.InvidiousError("403")

        with self.assertRaises(inv.InvidiousError) as cm:
            inv.fetch_video("dQw4w9WgXcQ", ["https://a.example", "https://b.example"], get)
        self.assertIn("a.example", str(cm.exception))
        self.assertIn("b.example", str(cm.exception))

    def test_error_payload_is_failure(self):
        with self.assertRaises(inv.InvidiousError):
            inv.fetch_video("dQw4w9WgXcQ", ["https://a.example"], lambda u: {"error": "Video unavailable"})


class PickTests(unittest.TestCase):
    def test_mp4_best_prefers_h264_and_m4a(self):
        s = inv.pick_streams(DATA, req(type="video", format="mp4", quality="best"))
        self.assertEqual((s["video"]["itag"], s["audio"]["itag"]), ("299", "140"))

    def test_quality_cap_and_60fps_preferred(self):
        s = inv.pick_streams(DATA, req(type="video", format="mp4", quality="720"))
        self.assertEqual(s["video"]["itag"], "298")

    def test_480(self):
        self.assertEqual(inv.pick_streams(DATA, req(type="video", format="mp4", quality="480"))["video"]["itag"], "135")

    def test_any_best_takes_highest(self):
        self.assertEqual(inv.pick_streams(DATA, req(type="video", format="any", quality="best"))["video"]["itag"], "401")

    def test_codec_filter(self):
        self.assertEqual(inv.pick_streams(DATA, req(type="video", format="any", quality="720", codec="vp9"))["video"]["itag"], "247")

    def test_audio_picks_best_bitrate(self):
        s = inv.pick_streams(DATA, req(type="audio", format="mp3"))
        self.assertEqual((s["video"], s["audio"]["itag"]), (None, "251"))

    def test_muxed_fallback_when_no_adaptive(self):
        d = {**DATA, "adaptiveFormats": []}
        s = inv.pick_streams(d, req(type="video", format="mp4", quality="best"))
        self.assertEqual(s["muxed"]["itag"], "18")

    def test_nothing(self):
        with self.assertRaises(inv.InvidiousError):
            inv.pick_streams({"adaptiveFormats": [], "formatStreams": []}, req(type="audio", format="mp3"))


class LimitsTests(unittest.TestCase):
    def test_live_and_long_rejected_in_public(self):
        with self.assertRaises(inv.InvidiousError):
            inv.check_limits({**DATA, "liveNow": True}, {}, 10800, 0)
        with self.assertRaises(inv.InvidiousError):
            inv.check_limits({**DATA, "lengthSeconds": 20000}, {}, 10800, 0)
        inv.check_limits({**DATA, "lengthSeconds": 20000}, {}, 0, 0)

    def test_safe_name(self):
        self.assertEqual(inv.safe_name('a/b:c*"d', "x"), "a_b_c__d")
        self.assertEqual(inv.safe_name("...", "x"), "x")


class BotCheckTests(unittest.TestCase):
    def test_detect(self):
        self.assertTrue(y.is_bot_check("Sign in to confirm you’re not a bot."))
        self.assertFalse(y.is_bot_check("Video unavailable"))


if __name__ == "__main__":
    unittest.main()
