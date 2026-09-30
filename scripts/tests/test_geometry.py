"""Tests for geometry.py's pure-Python polygon math (see that module's
docstring for why it exists instead of a shapely/pyproj/GDAL dependency).

Run with `python3 -m unittest discover -s tests` from scripts/, or
`make test` from the repo root.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from geometry import (  # noqa: E402 - path setup above must run first
    bbox_of_multipolygon,
    multipolygon_centroid,
    point_in_multipolygon,
)

# A single 10x10 square, exterior ring only, CCW.
SQUARE = [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]]

# Same square with a 2x2 hole punched in its centre, CW as GeoJSON requires.
SQUARE_WITH_HOLE = [
    [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[4, 4], [4, 6], [6, 6], [6, 4], [4, 4]],
    ]
]

# Two disjoint 2x2 squares - a MultiPolygon with two parts.
TWO_SQUARES = [
    [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
    [[[10, 10], [12, 10], [12, 12], [10, 12], [10, 10]]],
]


class MultipolygonCentroidTests(unittest.TestCase):
    def test_square_centroid_is_its_centre(self):
        self.assertEqual(multipolygon_centroid(SQUARE), (5.0, 5.0))

    def test_hole_does_not_shift_a_symmetric_centroid(self):
        # The hole is centred in the square, so area-weighting still lands
        # on (5, 5) - this is the case that would break if holes were
        # accidentally added instead of subtracted.
        cx, cy = multipolygon_centroid(SQUARE_WITH_HOLE)
        self.assertAlmostEqual(cx, 5.0)
        self.assertAlmostEqual(cy, 5.0)

    def test_degenerate_zero_area_falls_back_to_vertex_average(self):
        # Three collinear points -> zero signed area, so the shoelace
        # formula can't locate a centroid and the code falls back to a
        # plain average of all vertices instead.
        line = [[[[0, 0], [10, 0], [0, 0]]]]
        cx, cy = multipolygon_centroid(line)
        self.assertAlmostEqual(cx, 10 / 3)
        self.assertAlmostEqual(cy, 0.0)


class PointInMultipolygonTests(unittest.TestCase):
    def test_point_inside_square(self):
        self.assertTrue(point_in_multipolygon(5, 5, SQUARE))

    def test_point_outside_square(self):
        self.assertFalse(point_in_multipolygon(15, 5, SQUARE))

    def test_point_inside_hole_is_not_inside_polygon(self):
        self.assertFalse(point_in_multipolygon(5, 5, SQUARE_WITH_HOLE))

    def test_point_in_solid_part_of_polygon_with_hole(self):
        self.assertTrue(point_in_multipolygon(1, 1, SQUARE_WITH_HOLE))

    def test_point_in_second_part_of_a_multipart_polygon(self):
        self.assertTrue(point_in_multipolygon(11, 11, TWO_SQUARES))

    def test_point_in_neither_part(self):
        self.assertFalse(point_in_multipolygon(5, 5, TWO_SQUARES))


class BboxOfMultipolygonTests(unittest.TestCase):
    def test_bbox_of_single_square(self):
        self.assertEqual(bbox_of_multipolygon(SQUARE), (0, 0, 10, 10))

    def test_bbox_spans_all_parts(self):
        self.assertEqual(bbox_of_multipolygon(TWO_SQUARES), (0, 0, 12, 12))


if __name__ == "__main__":
    unittest.main()
