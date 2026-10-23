"""Render a 아톰문 성장일기 Short (1080x1920): main clip -> rewind + "다시 듣기" replay -> diary card -> subscribe card.

usage: render.py SCRATCH EPISODE.json SRC.mp4 OUT.mp4|STILLS_DIR [--stills t1,t2,...]
Video only; audio is built by music.py + mix.py.
"""
import math, os, random, subprocess, sys, wave
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
from episode import Episode, FPS

S, EP_PATH, SRC, OUT = sys.argv[1:5]
STILLS = None
if "--stills" in sys.argv:
    STILLS = [float(v) for v in sys.argv[sys.argv.index("--stills") + 1].split(",")]
EP = Episode(EP_PATH)

W, H = 1080, 1920
SW, SH = 1080, 2336
MAIN_N = int(round(EP.main_end * FPS))

FONT = "/usr/share/fonts/truetype/nanum/NanumSquareRoundEB.ttf"
PEN = "/usr/share/fonts/truetype/nanum/NanumPen.ttf"
EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
NAVY = (20, 36, 96)
YELLOW = (255, 216, 77)
WHITE = (255, 255, 255)
CORAL = (255, 77, 109)

BITES = EP["bites"]
LIFTS = EP["lifts"]
VOICES = [(a, b) for a, b, _ in EP["voices"]]
SUCCESS = EP["success"]
HEAD_KEYS = EP["head_keys"]


# ---------------------------------------------------------------- helpers
def clamp01(x):
    return max(0.0, min(1.0, x))

def ease_out_back(x, s=1.9):
    x = clamp01(x) - 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2

def smooth(x):
    x = clamp01(x)
    return x * x * (3 - 2 * x)

def ease_out(x):
    return 1 - (1 - clamp01(x)) ** 3

def lerp(a, b, k):
    return a + (b - a) * k

def head_at(t):
    for (t0, x0, y0), (t1, x1, y1) in zip(HEAD_KEYS, HEAD_KEYS[1:]):
        if t0 <= t <= t1:
            k = smooth((t - t0) / (t1 - t0))
            return lerp(x0, x1, k), lerp(y0, y1, k)
    return tuple(HEAD_KEYS[-1][1:])

_font_cache = {}
def font(size, path=FONT):
    if (size, path) not in _font_cache:
        _font_cache[(size, path)] = ImageFont.truetype(path, size)
    return _font_cache[(size, path)]

_emoji_font = ImageFont.truetype(EMOJI, 109)
_emoji_cache = {}
def emoji_img(ch, size):
    key = (ch, size)
    if key not in _emoji_cache:
        im = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
        ImageDraw.Draw(im).text((10, 10), ch, font=_emoji_font, embedded_color=True)
        im = im.crop(im.getbbox())
        sc = size / max(im.size)
        _emoji_cache[key] = im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)
    return _emoji_cache[key]

def is_emoji(ch):
    o = ord(ch)
    return o >= 0x1F000 or 0x2600 <= o <= 0x27BF

def runs(text):
    """Split '[hl]' markup and emoji into (kind, str) runs; kind in text/hl/emoji."""
    out, hl, buf = [], False, ""
    def flush():
        nonlocal buf
        if buf:
            out.append(("hl" if hl else "text", buf))
            buf = ""
    for ch in text:
        if ch == "️":
            continue
        if ch in "[]":
            flush(); hl = ch == "["
        elif is_emoji(ch):
            flush(); out.append(("emoji", ch))
        else:
            buf += ch
    flush()
    return out

def text_line(text, size, fill=WHITE, hl=YELLOW, stroke=NAVY, sw=None, path=FONT, shadow=True):
    """One line of styled text with stroke + soft shadow, returned as RGBA."""
    sw = sw if sw is not None else max(4, size // 8)
    f = font(size, path)
    asc, desc = f.getmetrics()
    pad = sw + 16
    parts, x = [], 0
    for kind, s in runs(text):
        if kind == "emoji":
            em = emoji_img(s, int(size * (0.85 if path == PEN else 1.08)))
            parts.append((kind, em, x)); x += em.width + int(size * 0.1)
        else:
            parts.append((kind, s, x)); x += int(f.getlength(s))
    w, h = int(x) + 2 * pad, asc + desc + 2 * pad
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    base = pad + asc
    for kind, s, px in parts:
        if kind == "emoji":
            mid = size * (0.36 if path == PEN else 0.42)
            im.alpha_composite(s, (int(pad + px), int(base - mid - s.height / 2)))
        else:
            d.text((pad + px, base), s, font=f, fill=hl if kind == "hl" else fill, anchor="ls",
                   stroke_width=sw, stroke_fill=stroke)
    return with_shadow(im, 7, 8, 150) if shadow else im

def with_shadow(im, dy, blur, alpha):
    sh = Image.new("RGBA", (im.width + 4 * blur, im.height + 4 * blur + dy), (0, 0, 0, 0))
    a = im.getchannel("A").point(lambda v: v * alpha // 255)
    blk = Image.new("RGBA", im.size, (10, 16, 48, 255)); blk.putalpha(a)
    sh.alpha_composite(blk, (2 * blur, 2 * blur + dy))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    sh.alpha_composite(im, (2 * blur, 2 * blur))
    return sh

def stack(lines, gap=0):
    w = max(l.width for l in lines); h = sum(l.height for l in lines) + gap * (len(lines) - 1)
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); y = 0
    for l in lines:
        im.alpha_composite(l, ((w - l.width) // 2, y)); y += l.height + gap
    return im

def scaled(im, s, alpha=1.0, rot=0.0):
    if abs(s - 1) > 1e-3:
        im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.BICUBIC)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 0.999:
        im = im.copy(); im.putalpha(im.getchannel("A").point(lambda v: int(v * alpha)))
    return im

def put(canvas, im, cx, cy):
    canvas.paste(im, (int(cx - im.width / 2), int(cy - im.height / 2)), im)

def pill(text, size, fill, color, outline=None, pad_x=34, h=None):
    t = text_line(text, size, fill=color, hl=CORAL, stroke=fill, sw=0, shadow=False)
    h = h or int(size * 1.9)
    w = t.width + 2 * pad_x - 30
    im = Image.new("RGBA", (w + 24, h + 24), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([12, 12, 12 + w, 12 + h], radius=h // 2, fill=fill, outline=outline, width=6 if outline else 0)
    im.alpha_composite(t, ((im.width - t.width) // 2, (im.height - t.height) // 2 + 2))
    return with_shadow(im, 6, 8, 120)


# ---------------------------------------------------------------- voice envelope (drives "음~" visuals)
def voice_envelope():
    wav = f"{S}/audio/orig16k.wav"
    if not os.path.exists(wav):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", SRC, "-ac", "1", "-ar", "16000", wav], check=True)
    w = wave.open(wav); sr = w.getframerate()
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    hop = sr // FPS
    rms = np.array([np.sqrt(np.mean(x[i:i + hop] ** 2)) + 1e-9 for i in range(0, len(x) - hop, hop)])
    db = 20 * np.log10(rms)
    env = np.clip((db + 50) / 18, 0, 1)
    out, v = np.zeros_like(env), 0.0
    for i, e in enumerate(env):                      # fast attack, slow release
        v = e if e > v else v * 0.82 + e * 0.18
        out[i] = v
    return out
ENV = voice_envelope()

def venv(src_t):
    """Voice loudness 0..1 at a source time, only inside the marked voice segments."""
    if not any(a - 0.05 <= src_t <= b + 0.1 for a, b in VOICES):
        return 0.0
    i = int(src_t * FPS)
    return float(ENV[min(max(i, 0), len(ENV) - 1)])


# ---------------------------------------------------------------- sprites
HOOK = [text_line(EP["hook"][0], 104), text_line(EP["hook"][1], 104)]

def caption_img(text, size=86, max_w=880):
    im = text_line(text, size)
    if im.width <= max_w or " " not in text:
        return im
    words = text.split(" ")
    best = min(range(1, len(words)), key=lambda k: abs(len(" ".join(words[:k])) - len(" ".join(words[k:]))))
    return stack([text_line(" ".join(words[:best]), size), text_line(" ".join(words[best:]), size)], gap=-30)
CAPTIONS = [tuple(c) for c in EP["captions"]]
CAP_IMG = [caption_img(c[2]) for c in CAPTIONS]
CAP_Y = 1255

def title_pill():
    t = text_line(EP["title"], 62, fill=NAVY, hl=(232, 74, 95), stroke=WHITE, sw=0)
    w, h = t.width + 20, 124
    im = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([20, 20, 20 + w, 20 + h], radius=h // 2, fill=(255, 255, 255, 240), outline=YELLOW, width=7)
    im.alpha_composite(t, ((im.width - t.width) // 2, (im.height - t.height) // 2 + 2))
    return with_shadow(im, 6, 8, 120)
TITLE = title_pill()
SERIES = pill(f"📔 승유 성장일기 EP.{EP['episode']:02d} · {EP['age']}", 36, (20, 36, 96, 235), WHITE, h=70)

def burst():
    R = 210
    im = Image.new("RGBA", (2 * R + 40, 2 * R + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(im); c = R + 20
    pts = []
    for i in range(28):
        r = R if i % 2 == 0 else R * 0.66
        a = math.pi * 2 * i / 28 + 0.1
        pts.append((c + r * math.cos(a), c + r * math.sin(a)))
    d.polygon(pts, fill=YELLOW, outline=(255, 140, 40))
    d.line(pts + [pts[0]], fill=(255, 140, 40), width=8, joint="curve")
    t = text_line("앙!", 150, fill=CORAL, stroke=WHITE, sw=14)
    im.alpha_composite(t, (c - t.width // 2, c - t.height // 2 - 6))
    return im
BURST = burst()

def speech_bubble(text):
    t = text_line(text, 84, fill=NAVY, hl=CORAL, stroke=WHITE, sw=0, shadow=False)
    w, h = t.width + 40, 150
    im = Image.new("RGBA", (w + 80, h + 90), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    box = [20, 20, 20 + w, 20 + h]
    tail = [(w - 70, 20 + h - 8), (w + 10, 20 + h + 62), (w - 10, 20 + h - 8)]
    d.polygon(tail, fill=WHITE, outline=NAVY)
    d.line([tail[0], tail[1], tail[2]], fill=NAVY, width=8, joint="curve")
    d.rounded_rectangle(box, radius=60, fill=WHITE, outline=NAVY, width=8)
    d.polygon([(tail[0][0] + 6, tail[0][1] - 4), (tail[1][0] - 6, tail[1][1] - 14), (tail[2][0] - 6, tail[2][1] - 4)], fill=WHITE)
    im.alpha_composite(t, (20 + (w - t.width) // 2, 20 + (h - t.height) // 2))
    note = emoji_img("🎵", 70)
    im.alpha_composite(note, (box[0] - 6, box[1] - 10))
    return with_shadow(im, 8, 10, 140)
BUBBLES_SPEECH = [speech_bubble(text) for _, _, text in EP["voices"]]

def bubble_sprite(size=128):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse([4, 4, size - 4, size - 4], fill=(200, 235, 255, 70), outline=(255, 255, 255, 220), width=6)
    d.ellipse([size * 0.24, size * 0.2, size * 0.42, size * 0.36], fill=(255, 255, 255, 230))
    return im
BUBBLE = bubble_sprite()
_bub_cache = {}
def bubble(sz):
    sz = max(8, int(sz))
    if sz not in _bub_cache:
        _bub_cache[sz] = BUBBLE.resize((sz, sz), Image.LANCZOS)
    return _bub_cache[sz]

rng = random.Random(11)
AMBIENT = []
_t = 0.3
while _t < EP.main_end:
    AMBIENT.append(dict(t0=_t, x=rng.uniform(70, 1010), v=rng.uniform(170, 300), s=rng.uniform(18, 46),
                        wob=rng.uniform(10, 26), fq=rng.uniform(0.8, 1.8), ph=rng.uniform(0, 6.28)))
    _t += rng.uniform(0.35, 0.75)
BITE_BUBBLES = {tb: [dict(dx=rng.uniform(-150, 150), v=rng.uniform(450, 850), s=rng.uniform(24, 64),
                          wob=rng.uniform(8, 20), ph=rng.uniform(0, 6.28)) for _ in range(14)] for tb in BITES}
BITE_FISH = {tb: [(rng.choice("🐟🐠🐡"), rng.uniform(0, 2 * math.pi)) for _ in range(3)] for tb in BITES}
CONFETTI = [dict(x=rng.uniform(0, W), v=rng.uniform(380, 650), d=rng.uniform(0, 0.5), rot=rng.uniform(0, 360),
                 spin=rng.uniform(-400, 400), c=rng.choice([YELLOW, CORAL, (90, 200, 255), (130, 230, 150), WHITE]),
                 w=rng.randint(14, 24), h=rng.randint(22, 34)) for _ in range(70)]
NOTES = [dict(dx=rng.uniform(-60, 60), sway=rng.uniform(20, 50), e=rng.choice("🎵🎶")) for _ in range(40)]

SPARK = emoji_img("✨", 90)

# replay overlays
REPLAY_PILL = pill("🎧 다시 듣기", 52, (255, 77, 109, 245), WHITE, h=104)
REPLAY_HINT = text_line("🔊 소리 켜고 들어보세요!", 44, sw=6)
REPLAY_CAPS = [text_line(r[4], 150, sw=16) for r in EP.replay]
REWIND_ICON = text_line("◀◀ 되감기", 96, sw=12)

def vignette():
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.sqrt(((x - W / 2) / (W * 0.62)) ** 2 + ((y - H * 0.42) / (H * 0.62)) ** 2)
    a = (np.clip((d - 0.55) / 0.6, 0, 1) ** 1.6 * 170).astype(np.uint8)
    im = Image.new("RGBA", (W, H), (10, 14, 40, 0)); im.putalpha(Image.fromarray(a))
    return im
VIGNETTE = vignette()

def scanlines():
    a = np.zeros((H, W), np.uint8); a[::6] = 38; a[1::6] = 20
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0)); im.putalpha(Image.fromarray(a))
    return im
SCANLINES = scanlines()

# diary card
def washi(w, h, color, rot):
    im = Image.new("RGBA", (w, h), color + (210,))
    d = ImageDraw.Draw(im)
    for x in range(-h, w, 26):
        d.line([(x, h), (x + h, 0)], fill=(255, 255, 255, 70), width=9)
    return im.rotate(rot, expand=True, resample=Image.BICUBIC)

def diary_card():
    cw, ch = 900, 1030
    im = Image.new("RGBA", (cw + 120, ch + 160), (0, 0, 0, 0))
    ox, oy = 60, 80
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([ox, oy, ox + cw, oy + ch], radius=40, fill=(255, 250, 238, 255), outline=(240, 214, 160), width=5)
    for y in range(oy + 320, oy + ch - 40, 104):
        d.line([(ox + 50, y), (ox + cw - 50, y)], fill=(196, 222, 246), width=4)
    d.line([(ox + 118, oy + 260), (ox + 118, oy + ch - 30)], fill=(247, 168, 176), width=4)
    for k in range(7):                                   # binder holes
        cx = ox + 120 + k * 110
        d.ellipse([cx - 14, oy + 22, cx + 14, oy + 50], fill=(232, 222, 205))
    head = text_line("📔 오늘의 승유", 74, fill=NAVY, stroke=(255, 250, 238), sw=0, shadow=False)
    im.alpha_composite(head, (ox + (cw - head.width) // 2, oy + 70))
    date = text_line(f"{EP['date']} · {EP['age']}", 58, fill=(110, 116, 140), stroke=(255, 250, 238), sw=0,
                     path=PEN, shadow=False)
    im.alpha_composite(date, (ox + (cw - date.width) // 2, oy + 180))
    im.alpha_composite(washi(220, 64, (255, 214, 102), 8), (ox - 40, oy - 50))
    im.alpha_composite(washi(220, 64, (126, 214, 196), -10), (ox + cw - 190, oy - 54))
    return im, (ox, oy)
DIARY_CARD, DIARY_ORIGIN = diary_card()
DIARY_LINES = [text_line(t, 84, fill=(46, 58, 89), stroke=(255, 250, 238), sw=0, path=PEN, shadow=False)
               for t in EP["diary"]]
PEN_ASC = font(84, PEN).getmetrics()[0]

def diary_with_lines(dt):
    """Card with handwritten lines revealed left-to-right, shadow applied last so it can rotate as one piece."""
    card = DIARY_CARD.copy()
    ox, oy = DIARY_ORIGIN
    for j, line in enumerate(DIARY_LINES):
        lt = dt - 0.55 - 0.45 * j
        if lt <= 0: continue
        wv = max(1, int(line.width * smooth(lt / 0.4)))
        part = line.crop((0, 0, wv, line.height))
        card.alpha_composite(part, (ox + 130, oy + 424 + 104 * j - (16 + PEN_ASC) - 4))
    return with_shadow(card, 14, 18, 150)

def stamp():
    sz = 270
    im = Image.new("RGBA", (sz, sz), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    red = (229, 56, 59, 235)
    d.ellipse([8, 8, sz - 8, sz - 8], outline=red, width=12)
    d.ellipse([30, 30, sz - 30, sz - 30], outline=red, width=5)
    d.text((sz / 2, sz / 2 - 42), "참", font=font(70), fill=red, anchor="mm")
    d.text((sz / 2, sz / 2 + 40), "잘했어요", font=font(54), fill=red, anchor="mm")
    a = np.array(im.getchannel("A")).astype(np.float32)
    noise = np.random.default_rng(4).uniform(0.55, 1.0, a.shape)
    im.putalpha(Image.fromarray((a * noise).astype(np.uint8)))
    return im
STAMP = stamp()

def cartoon_sticker(size):
    ch = Image.open(f"{S}/cartoon/character_1600.png").convert("RGBA")
    ch = ch.crop(ch.getbbox()).resize((size, int(size * ch.height / ch.width)), Image.LANCZOS)
    a = ch.getchannel("A").filter(ImageFilter.MaxFilter(17))
    st = Image.new("RGBA", ch.size, WHITE); st.putalpha(a)
    pad = Image.new("RGBA", (ch.width + 20, ch.height + 20), (0, 0, 0, 0))
    pad.alpha_composite(st, (10, 10)); pad.alpha_composite(ch, (10, 10))
    return with_shadow(pad, 8, 10, 130)
STICKER = cartoon_sticker(250)

def icon_badge(size=470):
    ic = Image.open(f"{S}/cartoon/atommoon_cartoon_icon_800.png").convert("RGBA").resize((size, size), Image.LANCZOS)
    m = Image.new("L", (size, size), 0); ImageDraw.Draw(m).ellipse([0, 0, size - 1, size - 1], fill=255)
    ic.putalpha(m)
    ring = Image.new("RGBA", (size + 28, size + 28), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse([0, 0, size + 27, size + 27], fill=WHITE)
    ring.alpha_composite(ic, (14, 14))
    return with_shadow(ring, 10, 14, 160)
ICON = icon_badge()
OUT_NAME = text_line("아톰문", 128, sw=14)
OUT_SUB = text_line("헬멧 쓴 아기 [승유]의 성장 일기", 50, sw=7)
OUT_NEXT = text_line("다음 성장일기도 기대해 주세요 💙", 46, sw=6)

def sub_button(on):
    w, h = 400, 128
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=h // 2, fill=(229, 229, 229) if on else (255, 0, 51))
    d.text((w / 2, h / 2 + 2), "구독중" if on else "구독", font=font(64), fill=(60, 60, 60) if on else WHITE, anchor="mm")
    return with_shadow(im, 8, 10, 140)
SUB_OFF, SUB_ON = sub_button(False), sub_button(True)
POINTER = emoji_img("👆", 120)
HEART = emoji_img("💙", 70)


# ---------------------------------------------------------------- camera
BASE_Z = 1.06
ZP = 1.34
def camera(t):
    hx, hy = head_at(t)
    zb = BASE_Z + 0.06 * t / EP.main_end
    z = zb
    for tb in BITES:                                  # punch-in on each bite
        if tb - 0.08 <= t <= tb + 1.6:
            k = ease_out((t - tb + 0.08) / 0.16) * (1 - smooth((t - tb - 1.0) / 0.6))
            z = max(z, lerp(zb, ZP, k))
    for a, b in VOICES:                               # push in on the baby's "음~"
        if a - 0.25 <= t <= b + 0.6:
            k = smooth((t - a + 0.25) / 0.6) * (1 - smooth((t - b) / 0.6))
            z = max(z, lerp(zb, 1.28, k))
    for tl in LIFTS:                                  # small push when the head comes up
        if tl - 0.1 <= t <= tl + 1.0:
            k = smooth((t - tl + 0.1) / 0.3) * (1 - smooth((t - tl - 0.6) / 0.4))
            z = max(z, lerp(zb, 1.16, k))
    k = clamp01((z - zb) / (ZP - zb))
    vw, vh = SW / z, SW / z * H / W
    bx = min(max(hx - vw / 2, 0), SW - vw)
    py = min(max(hy - vh * 0.40, 0), SH - vh)
    x0, y0 = bx, lerp(0, py, k)
    for tb in BITES:                                  # shake on bites
        dt = t - tb
        if 0 <= dt <= 0.45:
            amp = 13 * math.exp(-dt / 0.12) / z
            x0 += amp * math.sin(2 * math.pi * 17 * dt)
            y0 += amp * math.cos(2 * math.pi * 13 * dt)
    x0 = min(max(x0, 0), SW - vw); y0 = min(max(y0, 0), SH - vh)
    return x0, y0, vw, vh, z

def replay_camera(src_t, k):
    """Tight, slowly pushing frame on the head during the replay; k = 0..1 progress in the clip."""
    hx, hy = head_at(src_t)
    z = lerp(1.42, 1.55, k)
    vw, vh = SW / z, SW / z * H / W
    x0 = min(max(hx - vw / 2, 0), SW - vw)
    y0 = min(max(hy - vh * 0.42, 0), SH - vh)
    return x0, y0, vw, vh, z

def to_out(sx, sy, cam):
    x0, y0, vw, vh, z = cam
    return (sx - x0) * W / vw, (sy - y0) * H / vh

def view(frame, cam):
    x0, y0, vw, vh, z = cam
    return frame.resize((W, H), Image.BICUBIC, box=(x0, y0, x0 + vw, y0 + vh))


# ---------------------------------------------------------------- voice visuals
def draw_notes(img, hx, hy, t0, t, seed):
    """Music notes floating up from the head while the baby hums."""
    for j in range(int((t - t0) / 0.22) + 1):
        nt = t - t0 - j * 0.22
        if nt < 0 or nt > 1.3: continue
        n = NOTES[(seed * 7 + j) % len(NOTES)]
        x = hx + n["dx"] + n["sway"] * math.sin(nt * 5 + j)
        y = hy - 120 - 330 * ease_out(nt / 1.3)
        a = clamp01(nt / 0.15) * (1 - clamp01((nt - 0.9) / 0.4))
        put(img, scaled(emoji_img(n["e"], 76), 0.8 + 0.3 * ease_out(nt / 0.4), a), x, y)

def draw_rings(img, cx, cy, t, level):
    if level <= 0.02: return
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    for j in range(3):
        p = ((t * 1.3) + j / 3) % 1.0
        r = 200 + 420 * p
        a = int(200 * level * (1 - p))
        d.ellipse([cx - r, cy - r * 0.85, cx + r, cy + r * 0.85], outline=(255, 255, 255, a), width=10)
    img.paste(ov, (0, 0), ov)


# ---------------------------------------------------------------- stages
def draw_main(img, t, cam):
    for b in AMBIENT:
        dt = t - b["t0"]
        if dt < 0: continue
        y = 1980 - b["v"] * dt
        if y < 300: continue
        x = b["x"] + b["wob"] * math.sin(b["fq"] * 2 * math.pi * dt + b["ph"])
        a = min(1, dt / 0.4) * min(1, (y - 300) / 300) * 0.75
        put(img, scaled(bubble(b["s"]), 1, a), x, y)

    hx, hy = to_out(*head_at(t), cam)

    for tb in BITES:
        dt = t - tb
        if 0 <= dt <= 1.4:
            for b in BITE_BUBBLES[tb]:
                y = hy - 40 - b["v"] * dt
                x = hx + b["dx"] * (0.4 + dt) + b["wob"] * math.sin(10 * dt + b["ph"])
                a = (1 - clamp01((dt - 0.8) / 0.6)) * 0.9
                put(img, scaled(bubble(b["s"]), 1, a), x, y)
            for k, (fe, ang) in enumerate(BITE_FISH[tb]):
                if dt > 1.1: continue
                r = 120 + 520 * ease_out(dt / 1.1)
                fx, fy = hx + r * math.cos(ang + k * 2.1), hy + 0.6 * r * math.sin(ang + k * 2.1)
                put(img, scaled(emoji_img(fe, 90), 1, 1 - clamp01((dt - 0.6) / 0.5)), fx, fy)
        if -0.02 <= dt <= 0.95:
            s = 0.25 + 0.75 * ease_out_back(dt / 0.22)
            s *= 1 + 0.04 * math.sin(dt * 28) * math.exp(-dt * 4)
            a = 1 - clamp01((dt - 0.75) / 0.2)
            bx = min(max(hx + 230, 700), 830); by = min(max(hy - 120, 560), 760)
            put(img, scaled(BURST, s * 0.82, a, rot=-10 + 6 * math.sin(dt * 9)), bx, by)

    # the baby's "음~": rings + notes + speech bubble, pulsing with the real voice level
    for k, (a, b) in enumerate(VOICES):
        if a - 0.05 <= t <= b + 0.45:
            lvl = venv(t)
            draw_rings(img, hx, hy, t, 0.55 * lvl)
            draw_notes(img, hx, hy, a, min(t, b + 0.1), k)
            lt = t - a
            s = (0.3 + 0.7 * ease_out_back(lt / 0.25)) * (1 + 0.10 * lvl)
            al = 1 - clamp01((t - b - 0.2) / 0.25)
            bx = min(max(hx - 250, 230), 560); by = min(max(hy - 330, 500), 700)
            put(img, scaled(BUBBLES_SPEECH[k], s, al, rot=4 * math.sin(lt * 6)), bx, by)

    dt = t - SUCCESS
    if dt >= 0:
        for c in CONFETTI:
            ct = dt - c["d"]
            if ct < 0: continue
            y = -40 + c["v"] * ct
            if y > H + 40: continue
            piece = Image.new("RGBA", (c["w"], c["h"]), c["c"] + (255,))
            put(img, piece.rotate(c["rot"] + c["spin"] * ct, expand=True), c["x"] + 30 * math.sin(ct * 4 + c["x"]), y)
        for k in range(4):
            st = dt - 0.12 * k
            if st < 0: continue
            ang = k * 1.7 + 0.4
            s = ease_out_back(st / 0.3) * (1 + 0.1 * math.sin(st * 9))
            put(img, scaled(SPARK, max(0.05, s)), hx + 300 * math.cos(ang), hy - 60 + 230 * math.sin(ang))

    if t < 2.1:
        out = clamp01((t - 1.85) / 0.2)
        ys = [990, 1135]
        for k, line in enumerate(HOOK):
            lt = t - 0.08 - 0.32 * k
            if lt < 0: continue
            s = 0.3 + 0.7 * ease_out_back(lt / 0.3)
            s *= 1 + 0.035 * math.sin(lt * 7)
            put(img, scaled(line, s * (1 - 0.3 * out), 1 - out), 540, ys[k] - 140 * out)
        fx = 1240 - 1500 * smooth(t / 2.0)
        put(img, scaled(emoji_img("🐟", 120), 1, 1 - out), fx, 1330 + 22 * math.sin(t * 9))
        put(img, scaled(emoji_img("🐠", 90), 1, 1 - out), -160 + 1400 * smooth((t - 0.3) / 1.8), 820 + 18 * math.sin(t * 8 + 1))

    if t >= 1.7:
        k = ease_out_back((t - 1.7) / 0.45)
        put(img, TITLE, 540, -120 + (250 + 120) * k)
        ta = clamp01((t - 2.0) / 0.3)
        put(img, scaled(SERIES, 1, ta), 540, 372)

    for (a, b, txt), cap in zip(CAPTIONS, CAP_IMG):
        if a <= t < b:
            lt, rem = t - a, b - t
            s = 0.55 + 0.45 * ease_out_back(lt / 0.24)
            al = clamp01(lt / 0.08)
            if rem < 0.1 and b < EP.main_end - 0.01:
                al *= rem / 0.1
            if "앙" in txt:
                s *= 1 + 0.05 * math.sin(lt * 20) * math.exp(-lt * 3)
            if "음" in txt:
                s *= 1 + 0.06 * venv(t)
            put(img, scaled(cap, s, al), 540, CAP_Y)

def draw_rewind(thumbs, last_main, t):
    """0.3 s VHS-style rewind from the end of the clip back to the first replay moment."""
    k = (t - EP.main_end) / (EP.replay[0][0] - EP.main_end)
    src_t = lerp(EP.main_end, EP.replay[0][2], ease_out(k))
    idx = min(range(len(thumbs)), key=lambda i: abs(thumbs[i][0] - src_t))
    img = thumbs[idx][1].resize((W, H), Image.BILINEAR)
    img = ImageEnhance.Color(img).enhance(0.5)
    jit = int(14 * math.sin(t * 90))
    img = img.transform((W, H), Image.AFFINE, (1, 0, jit, 0, 1, 0), resample=Image.BILINEAR)
    img.paste(SCANLINES, (0, 0), SCANLINES)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    band = int((t * 3000) % H)
    d.rectangle([0, band, W, band + 60], fill=(255, 255, 255, 70))
    img.paste(ov, (0, 0), ov)
    put(img, scaled(REWIND_ICON, 0.9 + 0.1 * math.sin(t * 40)), 540, 960)
    return img

def draw_replay(frame, t, seg_i):
    o0, o1, s0, s1, _ = EP.replay[seg_i]
    src_t = s0 + (t - o0)
    k = (t - o0) / (o1 - o0)
    cam = replay_camera(src_t, k)
    img = view(frame, cam)
    img = ImageEnhance.Color(img).enhance(1.05)
    img.paste(VIGNETTE, (0, 0), VIGNETTE)
    hx, hy = to_out(*head_at(src_t), cam)
    lvl = venv(src_t)
    draw_rings(img, hx, hy, t, 0.9 * lvl)
    draw_notes(img, hx, hy, o0, t, 10 + seg_i)
    # white flash on each cut
    if t - o0 < 0.18:
        fl = Image.new("RGBA", (W, H), (255, 255, 255, int(220 * (1 - (t - o0) / 0.18))))
        img.paste(fl, (0, 0), fl)
    pk = ease_out_back((t - EP.replay[0][0]) / 0.35)
    put(img, scaled(REPLAY_PILL, max(0.05, pk)), 540, 250)
    put(img, scaled(REPLAY_HINT, 1, clamp01((t - EP.replay[0][0] - 0.2) / 0.3)), 540, 360)
    lt = t - o0
    s = (0.4 + 0.6 * ease_out_back(lt / 0.3)) * (1 + 0.16 * lvl)
    put(img, scaled(REPLAY_CAPS[seg_i], s, rot=3 * math.sin(lt * 5)), 540, 1240)
    return img

_diary_bg = {}
def draw_diary(bg_frame, t):
    d0, d1 = EP.diary
    dt = t - d0
    if "bg" not in _diary_bg:
        base = view(bg_frame, replay_camera(EP.replay[-1][3], 1.0)).filter(ImageFilter.GaussianBlur(22))
        _diary_bg["bg"] = Image.blend(base, Image.new("RGB", (W, H), (255, 236, 205)), 0.45)
    img = _diary_bg["bg"].copy()
    s = ease_out_back(dt / 0.45)
    card = scaled(diary_with_lines(dt), max(0.05, s), rot=-2 * (1 - smooth(dt / 0.5)) - 1.2)
    put(img, card, 540, 900 + 200 * (1 - smooth(dt / 0.45)))
    st = dt - 2.05
    if st >= 0:
        ss = lerp(1.7, 1.0, ease_out(st / 0.16))
        put(img, scaled(STAMP, ss, clamp01(st / 0.08), rot=-14), 790, 1240)
    sk = ease_out_back((dt - 0.3) / 0.4)
    if sk > 0:
        put(img, scaled(STICKER, max(0.05, sk), rot=-8 + 3 * math.sin(dt * 4)), 230, 1330)
    return img

def draw_subscribe(bg_frame, t):
    s0, _ = EP.subscribe
    dt = t - s0
    if "sub" not in _diary_bg:
        base = view(bg_frame, replay_camera(EP.replay[-1][3], 1.0)).filter(ImageFilter.GaussianBlur(22))
        _diary_bg["sub"] = Image.blend(base, Image.new("RGB", (W, H), (14, 26, 70)), 0.6)
    img = _diary_bg["sub"].copy()
    if dt < 0.2:                                       # cross-fade from the diary card
        img = Image.blend(draw_diary(bg_frame, s0 - 1e-3), img, dt / 0.2)
    for j in range(12):
        y = (1900 - ((dt * 160 + j * 170) % 1700))
        x = 90 + (j * 83) % 900 + 18 * math.sin(dt * 2 + j)
        put(img, scaled(bubble(24 + (j * 7) % 30), 1, 0.5), x, y)
    s = ease_out_back((dt - 0.05) / 0.45)
    if s > 0:
        put(img, scaled(ICON, max(0.05, s), rot=4 * math.sin(dt * 3)), 540, 650)
    s = ease_out_back((dt - 0.25) / 0.35)
    if s > 0:
        put(img, scaled(OUT_NAME, max(0.05, s)), 540, 990)
    a = clamp01((dt - 0.4) / 0.3)
    if a > 0:
        put(img, scaled(OUT_SUB, 1, a), 540, 1100 + 20 * (1 - a))
    s = ease_out_back((dt - 0.5) / 0.35)
    tap = 1.3
    if s > 0:
        press = 1 - 0.12 * math.exp(-((dt - tap) / 0.07) ** 2)
        btn = SUB_ON if dt >= tap else SUB_OFF
        put(img, scaled(btn, max(0.05, s) * press), 540, 1260)
    a = clamp01((dt - 1.6) / 0.3)
    if a > 0:
        put(img, scaled(OUT_NEXT, 1, a), 540, 1425)
    pa = clamp01((dt - 0.7) / 0.2) * (1 - clamp01((dt - tap - 0.4) / 0.3))
    if pa > 0:
        pk = smooth((dt - 0.75) / (tap - 0.75))
        put(img, scaled(POINTER, 1, pa), lerp(800, 600, pk), lerp(1490, 1340, pk))
    if dt >= tap:
        ht = dt - tap
        for j in range(6):
            spread = [0.0, 0.12, 0.25][j % 3]          # stay between the two text lines
            ang = math.pi + spread if j < 3 else -spread
            r = 170 + 230 * ease_out(ht / 0.8)
            put(img, scaled(HEART, 0.6 + 0.4 * ease_out(ht / 0.3), 1 - clamp01((ht - 0.7) / 0.4)),
                540 + r * math.cos(ang), 1260 + r * math.sin(ang))
    return img


# ---------------------------------------------------------------- io
def frames(start=None, dur=None):
    cmd = ["ffmpeg", "-v", "fatal"]        # we stop reading early on purpose; ignore the broken pipe
    if start is not None:
        cmd += ["-ss", f"{start:.3f}"]
    cmd += ["-i", SRC]
    if dur is not None:
        cmd += ["-t", f"{dur:.3f}"]
    cmd += ["-vf", "eq=saturation=1.12:contrast=1.03", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    n = SW * SH * 3
    while True:
        buf = p.stdout.read(n)
        if len(buf) < n: break
        yield Image.frombuffer("RGB", (SW, SH), buf, "raw", "RGB", 0, 1)
    p.stdout.close(); p.wait()

def main():
    want = None if STILLS is None else {int(round(s * FPS)): s for s in STILLS}
    enc = None
    if want is None:
        enc = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}",
                                "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "17",
                                "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709",
                                "-color_trc", "bt709", "-movflags", "+faststart", OUT], stdin=subprocess.PIPE)
    count = [0]
    def emit(i, make):
        if want is None:
            enc.stdin.write(make().tobytes())
        elif i in want:
            make().save(f"{OUT}/still_{want[i]:05.2f}.jpg", quality=88)
        count[0] += 1

    # main clip (+ small thumbnails for the rewind)
    thumbs = []
    for i, fr in enumerate(frames(0, EP.main_end)):
        if i >= MAIN_N: break
        t = i / FPS
        if i % 3 == 0:
            thumbs.append((t, fr.resize((540, 960), Image.BILINEAR, box=(0, 0, SW, SW * H / W))))
        def mk(fr=fr, t=t):
            cam = camera(t); img = view(fr, cam); draw_main(img, t, cam); return img
        emit(i, mk)
    i = MAIN_N
    # rewind
    while i < int(round(EP.replay[0][0] * FPS)):
        t = i / FPS
        emit(i, lambda t=t: draw_rewind(thumbs, None, t)); i += 1
    # replay clips
    last = None
    for k, (o0, o1, s0, s1, _) in enumerate(EP.replay):
        n = int(round((o1 - o0) * FPS))
        for j, fr in enumerate(frames(s0, s1 - s0 + 0.2)):
            if j >= n: break
            t = o0 + j / FPS
            emit(i, lambda fr=fr, t=t, k=k: draw_replay(fr, t, k)); i += 1
            last = fr
    last = last.copy()
    while i < int(round(EP.subscribe[0] * FPS)):
        t = i / FPS
        emit(i, lambda t=t: draw_diary(last, t)); i += 1
    while i < EP.total_frames:
        t = i / FPS
        emit(i, lambda t=t: draw_subscribe(last, t)); i += 1
    if enc:
        enc.stdin.close(); enc.wait()
    print("frames", i, "duration", i / FPS)

main()
