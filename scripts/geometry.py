"""Pure-Python polygon math - no shapely/pyproj/GDAL dependency needed.

Reprojection is avoided entirely by asking the WFS server to do it
(srsName=EPSG:4326 on the GetFeature request) rather than reimplementing
UTM<->WGS84 conversion here.
"""


def _ring_contribution(ring):
    """Shoelace-formula contribution of one ring to (area, cx_sum, cy_sum)."""
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i]
        x1, y1 = ring[i + 1]
        cross = x0 * y1 - x1 * y0
        a += cross
        cx += (x0 + x1) * cross
        cy += (y0 + y1) * cross
    return a, cx, cy


def multipolygon_centroid(coordinates):
    """Area-weighted centroid across all parts (and holes) of a GeoJSON
    MultiPolygon's coordinate array. Holes subtract naturally because GeoJSON
    orders exterior rings CCW and holes CW, which the shoelace formula
    already accounts for via signed area - no special-casing needed.
    """
    a_total = cx_total = cy_total = 0.0
    for rings in coordinates:
        for ring in rings:
            ra, rcx, rcy = _ring_contribution(ring)
            a_total += ra
            cx_total += rcx
            cy_total += rcy
    if abs(a_total) < 1e-12:
        # degenerate/near-zero-area polygon - fall back to vertex average
        pts = [p for rings in coordinates for ring in rings for p in ring]
        return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
    a_total *= 0.5
    return cx_total / (6 * a_total), cy_total / (6 * a_total)


def _point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-15) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_polygon(x, y, rings):
    if not _point_in_ring(x, y, rings[0]):
        return False
    return not any(_point_in_ring(x, y, hole) for hole in rings[1:])


def point_in_multipolygon(x, y, coordinates):
    return any(_point_in_polygon(x, y, poly) for poly in coordinates)


def bbox_of_multipolygon(coordinates):
    xs = [p[0] for poly in coordinates for ring in poly for p in ring]
    ys = [p[1] for poly in coordinates for ring in poly for p in ring]
    return min(xs), min(ys), max(xs), max(ys)
