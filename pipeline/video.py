"""12 s LinkedIn video (1080×1350, 30 fps): the same afternoon at 100 m, then down to 1 m, over the DOP20 aerial photo.

  python pipeline/video.py  (DOP_DIR = folder with the HVBG DOP20 tiles dop20_32_{476..478}_{5550..5551}_1_he.jpg)
  → media/day14_borgesian_12s.mp4, media/cover.jpg
"""
import json, os, subprocess
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
D, OUT = ROOT / "docs/data", ROOT / "media"
OUT.mkdir(exist_ok=True); FR = OUT / "frames"; FR.mkdir(exist_ok=True)
DOP_DIR = Path(os.environ.get("DOP_DIR", ""))
meta = json.loads((D / "meta.json").read_text()); squares = json.loads((D / "squares.json").read_text())
W, H, (LO, HI) = meta["width"], meta["height"], meta["range"]
E0, N1 = 476378.0, 5551802.0                                  # top-left of the UTCI grid (EPSG:25832, 1 m)
VW, VH, FPS, SEC = 1080, 1350, 30, 12
NF = FPS * SEC

# ── aerial photo: 6 DOP20 tiles → 0.5 m mosaic over the grid ──
DOPR = 0.5
mos = Image.new("RGB", (int(W / DOPR), int(H / DOPR)))
for e in (476, 477, 478):
    for n in (5550, 5551):
        t = Image.open(DOP_DIR / f"dop20_32_{e}_{n}_1_he.jpg").convert("RGB")
        t = t.resize((int(1000 / DOPR), int(1000 / DOPR)), Image.LANCZOS)
        mos.paste(t, (int((e * 1000 - E0) / DOPR), int((N1 - (n + 1) * 1000) / DOPR)))
dop = np.asarray(mos).astype(np.float32) / 255
dop = (dop.mean(axis=2, keepdims=True) * 0.55 + dop * 0.45) * 0.62           # desaturated and darker, like the web map

# ── UTCI at 16:00 CEST, 1 m, and its block means ──
v = np.asarray(Image.open(D / f"utci_{meta['peak']}.png"), dtype=np.float32)
U = LO + (v - 1) / 254 * (HI - LO); U[v == 0] = np.nan
def block(a, s):
    if s == 1: return a
    Hp, Wp = -(-H // s) * s, -(-W // s) * s
    p = np.full((Hp, Wp), np.nan, np.float32); p[:H, :W] = a
    b = p.reshape(Hp // s, s, Wp // s, s); n = np.isfinite(b).sum(axis=(1, 3)); m = np.nansum(b, axis=(1, 3)) / np.maximum(n, 1)
    m[n < 0.25 * s * s] = np.nan
    return np.repeat(np.repeat(m, s, 0), s, 1)[:H, :W]
STOPS = [(24, (92, 178, 168)), (28, (180, 214, 140)), (32, (255, 226, 128)), (36, (253, 166, 76)), (40, (236, 92, 52)), (44, (196, 34, 72)), (46, (140, 18, 92)), (50, (58, 10, 70))]
xs = np.array([s[0] for s in STOPS], np.float32); cs = np.array([s[1] for s in STOPS], np.float32) / 255
def colour(a, s):
    rgb = np.stack([np.interp(np.nan_to_num(a, nan=0), xs, cs[:, k]) for k in range(3)], -1)
    alpha = np.isfinite(a).astype(np.float32) * 0.9
    if s >= 5:                                                      # thin block lines, like the web map
        g = np.zeros((H, W), bool); g[::s, :] = True; g[:, ::s] = True
        rgb[g] *= 0.55
    return np.dstack([rgb, alpha])
RES = [100, 50, 25, 10, 5, 2, 1]
LAY = {s: Image.fromarray((colour(block(U, s), s) * 255).astype(np.uint8), "RGBA") for s in RES}
pidA = np.asarray(Image.open(D / "plaza_id.png")); rid = next(q["id"] for q in squares if q["name"] == "Römerberg"); mk = pidA == rid
edge = mk & ~(np.roll(mk, 1, 0) & np.roll(mk, -1, 0) & np.roll(mk, 1, 1) & np.roll(mk, -1, 1))
edge = edge | np.roll(edge, 1, 0) | np.roll(edge, 1, 1)
EDGE = Image.fromarray(np.dstack([np.full((H, W, 3), 255, np.uint8), (edge * 255).astype(np.uint8)]), "RGBA")
DOPI = Image.fromarray((np.clip(dop, 0, 1) * 255).astype(np.uint8))

# ── text ──
F = "/usr/share/fonts/opentype/inter/Inter-{}.otf"
f_eb, f_h1, f_big, f_txt, f_sm = ImageFont.truetype(F.format("SemiBold"), 26), ImageFont.truetype(F.format("ExtraBold"), 82), ImageFont.truetype(F.format("ExtraBold"), 150), ImageFont.truetype(F.format("Medium"), 34), ImageFont.truetype(F.format("Medium"), 24)
f_it = ImageFont.truetype("/usr/share/fonts/truetype/google-fonts/Lora-Italic-Variable.ttf", 82)
ACC = (255, 122, 61)
rom = next(q for q in squares if q["name"] == "Römerberg")["h"][meta["peak"]]

def ease(k): k = min(1, max(0, k)); return k * k * (3 - 2 * k)
# timeline (seconds)
T_RES = [(1.4, 100), (3.6, 50), (4.3, 25), (5.0, 10), (5.8, 5), (6.5, 2), (7.2, 1)]
def res_at(t):
    s = None
    for t0, r in T_RES:
        if t >= t0: s = r
    return s
# camera: whole Altstadt → Römerberg (centre in grid px), width in metres
CAM0, CAM1 = ((W / 2, H / 2), 930.0), ((891.0, 863.0), 300.0)
def cam(t):
    k = ease((t - 2.6) / 5.6)
    (x0, y0), w0 = CAM0; (x1, y1), w1 = CAM1
    w = np.exp(np.log(w0) + (np.log(w1) - np.log(w0)) * k)
    return x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, w

def frame(n):
    t = n / FPS
    cx, cy, wm = cam(t); mpp = wm / VW; hm = VH * mpp
    x0, y0 = cx - wm / 2, cy - hm / 2
    # aerial crop (0.5 m) and overlay crop (1 m), both resampled to the frame
    def crop(im, res, nearest):
        box = (x0 / res, y0 / res, (x0 + wm) / res, (y0 + hm) / res)
        return np.asarray(im.transform((VW, VH), Image.EXTENT, box, Image.NEAREST if nearest else Image.BILINEAR, fillcolor=(13, 11, 16) if im.mode == "RGB" else (0, 0, 0, 0))).astype(np.float32) / 255
    base = crop(DOPI, DOPR, False)
    s = res_at(t); img = base
    if s:
        ov = crop(LAY[s], 1, True)
        # each new resolution comes in with a short flash of its block lines, the old one fades out
        ti = max(t0 for t0, r in T_RES if r == s); a = ease((t - ti) / 0.35)
        prev = [r for t0, r in T_RES if t0 < ti]
        if prev and a < 1:
            ov0 = crop(LAY[prev[-1]], 1, True); ov = ov0 * (1 - a) + ov * a
        alpha = ov[..., 3:4] * (ease((t - 1.4) / 0.6) if s == 100 else 1)
        img = base * (1 - alpha) + ov[..., :3] * alpha
    if t >= 7.6:
        e = crop(EDGE, 1, False); ea = e[..., 3:4] * ease((t - 7.6) / 0.5)
        img = img * (1 - ea) + ea
    im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    # shade top and bottom for text
    sh = np.zeros((VH, 1), np.float32); yy = np.arange(VH)
    sh[:, 0] = np.clip(1 - yy / 430, 0, 1) ** 1.4 * 0.92 + np.clip((yy - 930) / 420, 0, 1) ** 1.3 * 0.94
    arr = np.asarray(im).astype(np.float32) * (1 - sh[..., None]) + np.array([13, 11, 16]) * sh[..., None]
    im = Image.fromarray(arr.astype(np.uint8)); d = ImageDraw.Draw(im, "RGBA")
    # header
    d.text((60, 56), "#30DAYMAPCHALLENGE · DAY 14 · BORGESIAN MAP", font=f_eb, fill=(185, 177, 168))
    d.text((60, 96), "The map that", font=f_h1, fill=(243, 239, 233))
    d.text((60, 186), "knows too much", font=f_it, fill=ACC)
    d.text((62, 290), "Frankfurt's squares, 27 June 2026, 16:00 · felt temperature (UTCI)", font=f_sm, fill=(185, 177, 168))
    # resolution label
    if s:
        lab = f"{s} m"; a = int(255 * ease((t - 1.4) / 0.4))
        d.text((60, 990), lab, font=f_big, fill=(255, 255, 255, a))
        txt = {100: "one number per block", 50: "", 25: "", 10: "streets appear", 5: "", 2: "", 1: "every square metre"}[s]
        if txt: d.text((64, 1150), txt, font=f_txt, fill=(243, 239, 233, a))
    # the finding about Römerberg, then the closing line
    if t >= 8.2:
        a = int(255 * ease((t - 8.2) / 0.5))
        bx = 470; d.rounded_rectangle((bx, 980, 1040, 1260), 26, fill=(18, 15, 22, int(0.86 * a)), outline=(255, 255, 255, int(0.15 * a)))
        d.text((bx + 26, 1000), "RÖMERBERG", font=f_eb, fill=(185, 177, 168, a))
        d.text((bx + 26, 1036), f"100 m says {rom['r100'][0]:.0f}–{rom['r100'][1]:.0f} °C", font=f_txt, fill=(243, 239, 233, a))
        d.text((bx + 26, 1082), f"1 m says {rom['p5']:.0f} and {rom['p95']:.0f} °C", font=f_txt, fill=ACC + (a,))
        d.text((bx + 26, 1134), "shade or sun, almost nothing between:", font=f_sm, fill=(185, 177, 168, a))
        d.text((bx + 26, 1166), f"{'under 1' if rom['inside100'] < 1 else round(rom['inside100'])}% of the square feels the 100 m value", font=f_sm, fill=(185, 177, 168, a))
    if t >= 10.2:
        a = int(255 * ease((t - 10.2) / 0.5))
        d.rectangle((0, 1270, VW, VH), fill=(13, 11, 16, a))
        d.text((60, 1282), "The average is a temperature nobody stands in.  barisparlatangiller.github.io", font=f_sm, fill=(243, 239, 233, a))
    # legend strip
    for i in range(300):
        vv = 30 + i / 299 * 20; c = tuple(int(255 * np.interp(vv, xs, cs[:, k])) for k in range(3))
        d.line((60 + i, 340, 60 + i, 350), fill=c)
    d.text((60, 356), "30", font=f_sm, fill=(185, 177, 168)); d.text((316, 356), "50 °C", font=f_sm, fill=(185, 177, 168))
    return im

for n in range(NF):
    frame(n).save(FR / f"f{n:04d}.png", compress_level=1)
    if n % 60 == 0: print("frame", n)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(FR / "f%04d.png"), "-c:v", "libx264", "-preset", "veryfast",
                "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(OUT / "day14_borgesian_12s.mp4")], check=True)
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(FR / f"f{int(9.6 * FPS):04d}.png"), "-q:v", "2", str(OUT / "cover.jpg")], check=True)
print("ok")
