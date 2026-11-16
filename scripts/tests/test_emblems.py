"""Tests for fetch_emblems.py's result handling (no network)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fetch_emblems import collect, commons_filename, province_name  # noqa: E402 - path setup above must run first


def row(ine, coa=None, flag=None):
    r = {"ine": {"value": ine}}
    if coa:
        r["coa"] = {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/" + coa}
    if flag:
        r["flag"] = {"value": "http://commons.wikimedia.org/wiki/Special:FilePath/" + flag}
    return r


class EmblemTests(unittest.TestCase):
    def test_filename_is_decoded(self):
        self.assertEqual(commons_filename("http://x/Special:FilePath/Escudo%20de%20%C3%81vila%20%28Burgos%29.svg"), "Escudo de Ávila (Burgos).svg")

    def test_place_without_images_is_left_out(self):
        self.assertEqual(collect([row("09011")], "ine"), {})

    def test_only_one_of_the_two_is_kept_as_is(self):
        self.assertEqual(collect([row("09297", coa="A.svg")], "ine"), {"09297": {"coa": "A.svg"}})

    def test_several_images_pick_the_first_by_name_every_time(self):
        rows = [row("1", coa="B.svg"), row("1", coa="A.svg", flag="F2.svg"), row("1", coa="A.svg", flag="F1.svg")]
        self.assertEqual(collect(rows, "ine"), {"1": {"coa": "A.svg", "flag": "F1.svg"}})
        self.assertEqual(collect(list(reversed(rows)), "ine"), collect(rows, "ine"))

    def test_province_name_matches_provinces_json(self):
        self.assertEqual(province_name("provincia de Ávila"), "Ávila")
        self.assertEqual(province_name("provincia del Bierzo"), "Bierzo")
        self.assertEqual(province_name("León"), "León")


if __name__ == "__main__":
    unittest.main()
