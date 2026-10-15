import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import subscriptions_check as s  # noqa: E402


class SubscriptionsTests(unittest.TestCase):
    def test_first_run_seeds_without_downloading(self):
        new, seen = s.select_new([{"id": "a"}, {"id": "b"}], [], first_run=True)
        self.assertEqual((new, seen), ([], ["a", "b"]))

    def test_only_unseen_are_new(self):
        new, seen = s.select_new([{"id": "c", "url": "u"}, {"id": "a"}], ["a", "b"], first_run=False)
        self.assertEqual([e["id"] for e in new], ["c"])
        self.assertEqual(seen, ["c", "a", "b"])

    def test_seen_is_capped(self):
        _, seen = s.select_new([{"id": "n"}], [str(i) for i in range(1000)], first_run=False)
        self.assertEqual(len(seen), s.MAX_SEEN)

    def test_due(self):
        self.assertTrue(s.is_due({"enabled": True, "lastChecked": 0}, 10**6))
        self.assertFalse(s.is_due({"enabled": False}, 10**9))
        self.assertFalse(s.is_due({"intervalHours": 12, "lastChecked": 1000}, 1000 + 3600))
        self.assertTrue(s.is_due({"intervalHours": 12, "lastChecked": 1000}, 1000 + 12 * 3600))


if __name__ == "__main__":
    unittest.main()
