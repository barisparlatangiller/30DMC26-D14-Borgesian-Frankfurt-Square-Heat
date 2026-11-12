"""Day 14 · Borgesian map — the same felt temperature (UTCI) of Frankfurt's Altstadt at 100 m, 10 m and 1 m.

Input (data/src, copied from the "Frankfurt Platz Heat" SOLWEIG project):
  frames/utci_20260627_HH.png   hourly UTCI at 1 m, 27 June 2026 (hottest day of the 24–28 June heatwave), hours in CET (UTC+1)
                                8-bit: 0 = no data (buildings, river), 1..255 = 10..52 °C
  plaza_id.tif                  1 m raster of the 24 squares (id = index in the GeoJSON + 1)
  plazas_altstadt_wgs84.geojson square outlines;  manifest.json  grid, corners, value range
Output (docs/data):
  utci_HH.png (copied), plaza_id.png, plazas.geojson, squares.json (per square and hour: what each resolution says), meta.json
"""
import json, shutil
from pathlib import Path
import numpy as np, rasterio
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC, OUT = ROOT / "data/src", ROOT / "docs/data"
OUT.mkdir(parents=True, exist_ok=True)
M = json.loads((SRC / "manifest.json").read_text())
LO, HI = M["ranges"]["utci"]
HOURS_CET = list(range(6, 23))                      # 07:00–23:00 CEST


def decode(p):
    v = np.asarray(Image.open(p), dtype=np.float32)
    out = LO + (v - 1) / 254 * (HI - LO)
    out[v == 0] = np.nan
    return out


def block_mean(a, s):
    """Mean of each s×s block (ignoring no-data); a block needs ≥ 25 % valid pixels, else no data. Returned at full size."""
    H, W = a.shape
    Hp, Wp = -(-H // s) * s, -(-W // s) * s
    p = np.full((Hp, Wp), np.nan, np.float32); p[:H, :W] = a
    b = p.reshape(Hp // s, s, Wp // s, s)
    n = np.isfinite(b).sum(axis=(1, 3)); m = np.nansum(b, axis=(1, 3)) / np.maximum(n, 1)
    m[n < 0.25 * s * s] = np.nan
    return np.repeat(np.repeat(m, s, 0), s, 1)[:H, :W]


pid = rasterio.open(SRC / "plaza_id.tif").read(1)
Image.fromarray(pid.astype(np.uint8)).save(OUT / "plaza_id.png", optimize=True)
gj = json.loads((SRC / "plazas_altstadt_wgs84.geojson").read_text())
for i, f in enumerate(gj["features"]):
    f["properties"] = {"id": i + 1, "name": f["properties"]["name"], "area_m2": f["properties"]["area_m2"], "approx": f["properties"]["geom_source"] != "alkis"}
(OUT / "plazas.geojson").write_text(json.dumps(gj, separators=(",", ":")))

squares = [{"id": i + 1, "name": f["properties"]["name"], "area": f["properties"]["area_m2"], "h": {}} for i, f in enumerate(gj["features"])]
hist_bins = np.arange(20, 52.5, 0.5)
for h in HOURS_CET:
    src = SRC / f"frames/utci_20260627_{h:02d}.png"
    shutil.copy(src, OUT / f"utci_{h + 1:02d}.png")      # file named by summer time (CEST)
    a1 = decode(src); a10 = block_mean(a1, 10); a100 = block_mean(a1, 100)
    for q in squares:
        m = (pid == q["id"]) & np.isfinite(a1)
        v1, v10, v100 = a1[m], a10[m], a100[m]
        if v1.size == 0: continue
        mean = float(v1.mean())
        hst, _ = np.histogram(v1, bins=hist_bins)
        q["h"][f"{h + 1:02d}"] = {                                        # key: hour in CEST
            "mean": round(mean, 1), "min": round(float(v1.min()), 1), "max": round(float(v1.max()), 1),
            "p5": round(float(np.percentile(v1, 5)), 1), "p95": round(float(np.percentile(v1, 95)), 1),
            "off2": round(float((np.abs(v1 - mean) >= 2).mean() * 100)),     # % of the square ≥ 2 °C away from its own mean
            "r10": [round(float(np.nanmin(v10)), 1), round(float(np.nanmax(v10)), 1)] if np.isfinite(v10).any() else None,
            "r100": [round(float(np.nanmin(v100)), 1), round(float(np.nanmax(v100)), 1)] if np.isfinite(v100).any() else None,
            "cells100": int(len(np.unique(np.stack([np.nonzero(m)[0] // 100, np.nonzero(m)[1] // 100]), axis=1).T)),
            "hist": hst.tolist()}
        r = q["h"][f"{h + 1:02d}"]["r100"]
        q["h"][f"{h + 1:02d}"]["inside100"] = round(float(((v1 >= r[0] - 0.25) & (v1 <= r[1] + 0.25)).mean() * 100), 1) if r else None   # % of the square at the 100 m value
    print(f"{h + 1:02d}:00 CEST  done")

peak = "16"
spread = sorted(squares, key=lambda q: -(q["h"][peak]["p95"] - q["h"][peak]["p5"]))
meta = {"corners": M["corners"], "width": M["width"], "height": M["height"], "range": [LO, HI], "date": "2026-06-27",
        "hours": [f"{h + 1:02d}" for h in HOURS_CET], "peak": peak, "hist_bins": [20, 52, 0.5],
        "source": "SOLWEIG 1 m (UMEP), DWD 01420 provisional weather, HVBG DGM1/DOM1, ALKIS, Frankfurt tree register",
        "widest": [q["name"] for q in spread[:3]],
        "nobody100": sum(1 for q in squares if q["h"][peak]["inside100"] is not None and q["h"][peak]["inside100"] < 1),
        "sun_shade": [round(float(np.median([q["h"][peak]["p5"] for q in squares])), 1), round(float(np.median([q["h"][peak]["p95"] for q in squares])), 1)]}
(OUT / "squares.json").write_text(json.dumps(squares, separators=(",", ":")))
(OUT / "meta.json").write_text(json.dumps(meta, indent=1))
q = spread[0]["h"][peak]
print("widest at 16:00 CEST:", spread[0]["name"], q["p5"], "–", q["p95"], "mean", q["mean"], "100 m:", q["r100"])
