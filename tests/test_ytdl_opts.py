import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import ytdl_opts as y  # noqa: E402


def req(**kw):
    base = {"v": 1, "jobId": "abcd1234", "urls": ["https://example.com/v"]}
    base.update(kw)
    return y.normalize(base)


class NormalizeTests(unittest.TestCase):
    def test_defaults(self):
        r = req()
        self.assertEqual((r["type"], r["format"], r["quality"], r["codec"]), ("video", "any", "best", "auto"))

    def test_rejects_bad_url(self):
        with self.assertRaises(y.InvalidRequest):
            req(urls=["file:///etc/passwd"])

    def test_rejects_bad_job_id(self):
        with self.assertRaises(y.InvalidRequest):
            req(jobId="../x")

    def test_rejects_unknown_format(self):
        with self.assertRaises(y.InvalidRequest):
            req(type="audio", format="aac")

    def test_rejects_path_escape_template(self):
        with self.assertRaises(y.InvalidRequest):
            req(outputTemplate="../../etc/%(title)s")
        with self.assertRaises(y.InvalidRequest):
            req(outputTemplate="/tmp/%(title)s")

    def test_rejects_forbidden_ytdl_options(self):
        with self.assertRaises(y.InvalidRequest):
            req(ytdlOptions={"cookiefile": "/x"})


class FormatTests(unittest.TestCase):
    def test_video_best(self):
        self.assertEqual(y.get_format(req()), "bestvideo+bestaudio/best")

    def test_video_1080_mp4_h264(self):
        f = y.get_format(req(quality="1080", format="mp4", codec="h264"))
        self.assertTrue(f.startswith("bestvideo[vcodec~='^(h264|avc)'][height<=1080][ext=mp4]+bestaudio[ext=m4a]/"))
        self.assertTrue(f.endswith("/best[height<=1080][ext=mp4]"))

    def test_audio_mp3(self):
        self.assertEqual(y.get_format(req(type="audio", format="mp3")), "bestaudio[ext=mp3]/bestaudio/best")


class OptsTests(unittest.TestCase):
    def test_audio_with_cover_chain(self):
        o = y.get_opts(req(type="audio", format="mp3", quality="320"), {})
        keys = [p["key"] for p in o["postprocessors"]]
        self.assertEqual(keys, ["FFmpegExtractAudio", "FFmpegThumbnailsConvertor", "FFmpegMetadata", "EmbedThumbnail"])
        self.assertEqual(o["postprocessors"][0]["preferredquality"], "320")
        self.assertTrue(o["writethumbnail"])

    def test_audio_wav_has_no_tags(self):
        o = y.get_opts(req(type="audio", format="wav"), {})
        self.assertEqual([p["key"] for p in o["postprocessors"]], ["FFmpegExtractAudio"])

    def test_captions_prefer_manual(self):
        o = y.get_opts(req(type="captions", subtitleLanguage="fr"), {})
        self.assertTrue(o["skip_download"])
        self.assertEqual(o["subtitleslangs"], ["fr", "fr-orig"])
        self.assertEqual(o["subtitlesformat"], "srt/best")

    def test_captions_txt_maps_to_srt(self):
        o = y.get_opts(req(type="captions", format="txt"), {})
        self.assertEqual(o["subtitlesformat"], "srt/best")

    def test_thumbnail(self):
        o = y.get_opts(req(type="thumbnail"), {})
        self.assertTrue(o["skip_download"] and o["writethumbnail"])

    def test_limit_and_chapters(self):
        o = y.get_opts(req(playlistLimit=5, splitChapters=True), {})
        self.assertEqual(o["playlistend"], 5)
        self.assertIn("FFmpegSplitChapters", [p["key"] for p in o["postprocessors"]])

    def test_user_options_merge_over_base(self):
        o = y.get_opts(req(ytdlOptions={"retries": 9}), {"retries": 3, "geo_bypass": True})
        self.assertEqual((o["retries"], o["geo_bypass"]), (9, True))


if __name__ == "__main__":
    unittest.main()
