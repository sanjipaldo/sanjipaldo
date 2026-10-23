"""Series extras: Shorts cover image (1080x1920) and channel banner (2560x1440).

usage: extras.py SCRATCH EPISODE.json SRC.mp4 OUT_DIR
"""
import math, os, random, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
from episode import Episode

S, EP_PATH, SRC, OUT = sys.argv[1:5]
EP = Episode(EP_PATH)
FONT = "/usr/share/fonts/truetype/nanum/NanumSquareRoundEB.ttf"
PEN = "/usr/share/fonts/truetype/nanum/NanumPen.ttf"
EMOJI = ImageFont.truetype("/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf", 109)
NAVY, YELLOW, WHITE, CORAL = (20, 36, 96), (255, 216, 77), (255, 255, 255), (255, 77, 109)

def emoji(ch, size):
    im = Image.new("RGBA", (160, 160)); ImageDraw.Draw(im).text((10, 10), ch, font=EMOJI, embedded_color=True)
    im = im.crop(im.getbbox()); sc = size / max(im.size)
    return im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)

def shadow(im, dy=8, blur=10, alpha=150):
    sh = Image.new("RGBA", (im.width + 4 * blur, im.height + 4 * blur + dy))
    blk = Image.new("RGBA", im.size, (10, 16, 48, 255)); blk.putalpha(im.getchannel("A").point(lambda v: v * alpha // 255))
    sh.alpha_composite(blk, (2 * blur, 2 * blur + dy)); sh = sh.filter(ImageFilter.GaussianBlur(blur))
    sh.alpha_composite(im, (2 * blur, 2 * blur)); return sh

def text(s, size, fill=WHITE, stroke=NAVY, sw=None, path=FONT, hl=YELLOW, emoji_after=None):
    """Text with '[highlight]' markup, an optional leading emoji (first char) and an optional trailing emoji."""
    sw = size // 8 if sw is None else sw
    f = ImageFont.truetype(path, size); asc, desc = f.getmetrics()
    lead = None
    if s and ord(s[0]) >= 0x1F000:
        lead, s = emoji(s[0], int(size * 1.05)), s[1:]
    parts, x, hlon = [], (lead.width + size * 0.1 if lead else 0), False
    for chunk in s.replace("[", "\0[").replace("]", "\0]").split("\0"):
        if chunk.startswith("["): hlon, chunk = True, chunk[1:]
        elif chunk.startswith("]"): hlon, chunk = False, chunk[1:]
        if chunk: parts.append((chunk, x, hlon)); x += f.getlength(chunk)
    em = emoji(emoji_after, int(size * 1.05)) if emoji_after else None
    w = int(x + (em.width + size * 0.15 if em else 0)) + 2 * (sw + 12)
    im = Image.new("RGBA", (w, asc + desc + 2 * (sw + 12))); d = ImageDraw.Draw(im)
    for chunk, px, h in parts:
        d.text((sw + 12 + px, sw + 12 + asc), chunk, font=f, fill=hl if h else fill, anchor="ls", stroke_width=sw, stroke_fill=stroke)
    if lead: im.alpha_composite(lead, (sw + 12, int(sw + 12 + asc - size * 0.42 - lead.height / 2)))
    if em: im.alpha_composite(em, (int(sw + 12 + x + size * 0.15), int(sw + 12 + asc - size * 0.42 - em.height / 2)))
    return shadow(im)

def put(canvas, im, cx, cy, rot=0):
    if rot: im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))

def character(width):
    ch = Image.open(f"{S}/cartoon/character_1600.png").convert("RGBA"); ch = ch.crop(ch.getbbox())
    ch = ch.resize((width, int(width * ch.height / ch.width)), Image.LANCZOS)
    a = ch.getchannel("A").filter(ImageFilter.MaxFilter(int(width / 30) | 1))
    st = Image.new("RGBA", ch.size, WHITE); st.putalpha(a); st.alpha_composite(ch)
    return shadow(st, 10, 14, 140)

def pill(s, size, bg, fg, h):
    t = text(s, size, fill=fg, stroke=bg, sw=0)
    im = Image.new("RGBA", (t.width + 40, h + 20)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([10, 10, t.width + 30, h + 10], radius=h // 2, fill=bg)
    im.alpha_composite(t, (20, (h + 20 - t.height) // 2 + 4)); return shadow(im, 6, 8, 120)

def space_bg(w, h, seed=3):
    rnd = random.Random(seed)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.clip(np.sqrt(((x - w * 0.45) / w) ** 2 + ((y - h * 0.45) / h) ** 2) / 0.75, 0, 1)[..., None]
    rgb = np.array([58, 114, 230], np.float32) * (1 - d) + np.array([10, 22, 64], np.float32) * d
    im = Image.fromarray(rgb.astype(np.uint8)).convert("RGBA"); dr = ImageDraw.Draw(im)
    for _ in range(int(w * h / 9000)):
        sx, sy, r = rnd.uniform(0, w), rnd.uniform(0, h), rnd.choice([1.5, 2, 2.5, 3.2])
        dr.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(255, 255, 255, rnd.randint(110, 255)))
    return im

def sparkle(dr, x, y, r, fill=(255, 243, 196, 255)):
    pts = [(x + (r if i % 2 == 0 else r * .3) * math.cos(math.pi / 4 * i - math.pi / 2),
            y + (r if i % 2 == 0 else r * .3) * math.sin(math.pi / 4 * i - math.pi / 2)) for i in range(8)]
    dr.polygon(pts, fill=fill)

def moon(im, cx, cy, r):
    layer = Image.new("RGBA", im.size); d = ImageDraw.Draw(layer)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 214, 77, 255))
    bx, by, br = cx - r * .45, cy - r * .3, r * .92
    cut = Image.new("L", im.size, 0); ImageDraw.Draw(cut).ellipse([bx - br, by - br, bx + br, by + br], fill=255)
    layer.putalpha(Image.fromarray(np.minimum(np.array(layer.getchannel("A")), 255 - np.array(cut))))
    im.alpha_composite(layer.filter(ImageFilter.GaussianBlur(r * .15))); im.alpha_composite(layer)

def orbits(im, cx, cy, a, b, width, alpha=255):
    layer = Image.new("RGBA", im.size); d = ImageDraw.Draw(layer)
    for rot in (0, 60, 120):
        pts = []
        for i in range(361):
            t = 2 * math.pi * i / 360; x, y = a * math.cos(t), b * math.sin(t)
            c, s = math.cos(math.radians(rot)), math.sin(math.radians(rot))
            pts.append((cx + x * c - y * s, cy + x * s + y * c))
        d.line(pts, fill=(134, 230, 255, alpha), width=width)
    im.alpha_composite(layer.filter(ImageFilter.GaussianBlur(width))); im.alpha_composite(layer)


def cover():
    W, H = 1080, 1920
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", "26.6", "-i", SRC, "-frames:v", "1", "-vf",
                          "eq=saturation=1.15:contrast=1.04", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    fr = Image.frombuffer("RGB", (1080, 2336), raw, "raw", "RGB", 0, 1)
    z = 1.25; vw, vh = 1080 / z, 1920 / z
    x0, y0 = max(0, 400 - vw / 2), max(0, 720 - vh * 0.42)
    im = fr.resize((W, H), Image.LANCZOS, box=(x0, y0, x0 + vw, y0 + vh)).convert("RGBA")
    grad = np.zeros((H, W), np.uint8); grad[int(H * .55):] = np.linspace(0, 150, H - int(H * .55))[:, None].astype(np.uint8)
    dark = Image.new("RGBA", (W, H), (12, 20, 60, 0)); dark.putalpha(Image.fromarray(grad)); im.alpha_composite(dark)
    put(im, pill(f"📔 승유 성장일기 EP.{EP['episode']:02d}", 46, (20, 36, 96, 240), WHITE, 92), 540, 230)
    put(im, text("입으로", 150, sw=18), 540, 1080, rot=-3)
    put(im, text("[물고기] 사냥?!", 150, sw=18), 540, 1250, rot=-3)
    bub = text("음~", 110, fill=NAVY, stroke=WHITE, sw=14, emoji_after="🎵")
    put(im, bub, 300, 520, rot=6)
    put(im, character(330), 860, 1560, rot=8)
    put(im, emoji("🐟", 130), 170, 1500, rot=-15)
    return im.convert("RGB")

def banner():
    W, H = 2560, 1440
    im = space_bg(W, H); dr = ImageDraw.Draw(im)
    for (x, y, r) in [(560, 560, 26), (2010, 520, 22), (760, 900, 16), (1840, 930, 18), (1300, 470, 12)]:
        sparkle(dr, x, y, r)
    moon(im, 1960, 620, 120)
    ch = character(275)
    orbits(im, 800, 712, 250, 72, 8, 230)
    put(im, ch, 800, 716)
    put(im, text("아톰문", 170, sw=18), 1400, 625)
    put(im, text("헬멧 쓴 아기 [승유]의 성장 일기", 62, sw=8), 1410, 760)
    put(im, pill("🚀 하루하루 자라는 이야기, 쇼츠로 만나요", 38, (255, 216, 77, 255), NAVY, 80), 1410, 868)
    return im.convert("RGB")

os.makedirs(OUT, exist_ok=True)
cover().save(f"{OUT}/cover_ep{EP['episode']:02d}.jpg", quality=92)
b = banner(); b.save(f"{OUT}/channel_banner_2560x1440.jpg", quality=92)
# preview of the TV / desktop / mobile safe areas
pv = b.copy(); d = ImageDraw.Draw(pv)
d.rectangle([(2560 - 2560) / 2, (1440 - 423) / 2, 2560, (1440 + 423) / 2], outline=(255, 80, 80), width=6)
d.rectangle([(2560 - 1546) / 2, (1440 - 423) / 2, (2560 + 1546) / 2, (1440 + 423) / 2], outline=(80, 255, 120), width=6)
pv.resize((1280, 720)).save(f"{OUT}/banner_safe_area_preview.jpg", quality=85)
print("ok")
