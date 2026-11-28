"""Rebuild a space-theme '아톰문' channel badge from a video frame: navy starfield, orbit rings, moon and a
small planet around a round photo of 승유.

usage: make_icon.py SRC.mp4 TIME CX CY SIDE OUT.png
"""
import subprocess, sys, math, random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

src, tm, cx, cy, side, out = sys.argv[1], float(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]), sys.argv[6]
raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{tm}", "-i", src, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                     capture_output=True, check=True).stdout
fr = Image.frombuffer("RGB", (1080, 1920), raw, "raw", "RGB", 0, 1)
N = 800
ys, xs = np.mgrid[0:N, 0:N]
r = np.hypot(xs - N / 2, ys - N / 2) / (N / 2)
bg = np.zeros((N, N, 3))
for c, (a, b) in enumerate([(30, 12), (52, 24), (128, 66)]):     # radial navy gradient
    bg[..., c] = a + (b - a) * np.clip(r, 0, 1)
icon = Image.fromarray(bg.astype(np.uint8)).convert("RGBA")
d = ImageDraw.Draw(icon)
rng = random.Random(3)
for _ in range(140):                                              # stars
    x, y, s = rng.uniform(0, N), rng.uniform(0, N), rng.choice([1, 1, 2, 2, 3])
    d.ellipse([x - s, y - s, x + s, y + s], fill=(255, 255, 255, rng.randint(120, 255)))
rings = Image.new("RGBA", (N, N), (0, 0, 0, 0)); rd = ImageDraw.Draw(rings)
for k, (w, h, a) in enumerate([(700, 250, 150), (760, 330, 90)]):
    rd.ellipse([(N - w) / 2, (N - h) / 2 + 40, (N + w) / 2, (N + h) / 2 + 40], outline=(220, 235, 255, a), width=5)
icon.alpha_composite(rings.rotate(-18, resample=Image.BICUBIC))
d.ellipse([600, 70, 720, 190], fill=(255, 216, 77))               # crescent moon
d.ellipse([630, 50, 750, 170], fill=(40, 60, 140))
d.ellipse([70, 520, 140, 590], fill=(255, 120, 140)); d.arc([50, 540, 160, 570], 0, 360, fill=(255, 220, 230), width=4)
# round photo
ph = fr.crop((cx - side // 2, cy - side // 2, cx + side // 2, cy + side // 2)).resize((520, 520), Image.LANCZOS)
ph = ph.filter(ImageFilter.UnsharpMask(radius=2.2, percent=90, threshold=2))
ph = ImageEnhance.Color(ph).enhance(1.08); ph = ImageEnhance.Brightness(ph).enhance(1.04)
m = Image.new("L", (520, 520), 0); ImageDraw.Draw(m).ellipse([0, 0, 519, 519], fill=255)
ring = Image.new("RGBA", (556, 556), (0, 0, 0, 0)); ImageDraw.Draw(ring).ellipse([0, 0, 555, 555], fill=(255, 255, 255, 255))
phr = ph.convert("RGBA"); phr.putalpha(m)
ring.alpha_composite(phr, (18, 18))
sh = Image.new("RGBA", (N, N), (0, 0, 0, 0)); sh.alpha_composite(ring, ((N - 556) // 2, (N - 556) // 2 + 14))
sh = Image.fromarray((np.array(sh) * [0, 0, 0, 0.5]).astype(np.uint8)).filter(ImageFilter.GaussianBlur(14))
icon.alpha_composite(sh); icon.alpha_composite(ring, ((N - 556) // 2, (N - 556) // 2))
mask = Image.new("L", (N, N), 0); ImageDraw.Draw(mask).ellipse([0, 0, N - 1, N - 1], fill=255)
icon.putalpha(mask)
icon.save(out)
print("ok", out)
