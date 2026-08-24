#!/usr/bin/env python3
"""Pull the two JCyL WFS layers this project depends on, reprojected to
WGS84 (EPSG:4326) server-side so nothing here has to do coordinate math:

- pacu_cyl_bic_inmu_vw: the official BIC (protected heritage) monuments
- limites_cyl_municipios: municipality boundaries, for the spatial join
  that derives which municipality each monument sits in

Writes raw GeoJSON to data/raw/ - regenerate anytime, nothing here is
hand-edited.
"""
import json
import os
import urllib.parse
import urllib.request

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")
USER_AGENT = "cylinked/0.1 (https://github.com/tholbach/cylinked)"


def wfs_get_feature(base_url, workspace, typename, extra=None):
    params = {
        "service": "WFS",
        "version": "1.1.0",
        "request": "GetFeature",
        "typename": typename,
        "srsName": "EPSG:4326",
        "outputFormat": "application/json",
    }
    if extra:
        params.update(extra)
    url = f"{base_url}/{workspace}/wfs?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.load(resp)


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    base = "https://idecyl.jcyl.es/geoserver"

    print("fetching BIC monuments (pacu_cyl_bic_inmu_vw)...")
    monuments = wfs_get_feature(base, "patrimoniocultural", "patrimoniocultural:pacu_cyl_bic_inmu_vw")
    print(f"  {len(monuments['features'])} features")
    json.dump(monuments, open(os.path.join(RAW_DIR, "monuments.json"), "w"), ensure_ascii=False)

    print("fetching municipality boundaries (limites_cyl_municipios)...")
    munis = wfs_get_feature(base, "limites", "limites:limites_cyl_municipios")
    print(f"  {len(munis['features'])} features")
    json.dump(munis, open(os.path.join(RAW_DIR, "municipios.json"), "w"), ensure_ascii=False)


if __name__ == "__main__":
    main()
