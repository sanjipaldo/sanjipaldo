"""EP06 '첫 사과' Short in the EP01 style, edited from a 26.4 s vertical clip (8 months, first apple ever):
hook (slow-mo sour face) -> first bite -> slow-mo pucker '셔!!' -> recovering -> 'give me more' -> eats again ->
'don't take it away' pout -> more '아~' -> one more bite -> first-apple review card. Two gauges (신맛 / 또 먹고 싶음).

usage: render_ep06.py SCRATCH SRC.mp4 OUT.mp4|STILLS_DIR [--stills t1,t2,...]
"""
import math, random, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
STILLS = None
if "--stills" in sys.argv:
    STILLS = [float(v) for v in sys.argv[sys.argv.index("--stills") + 1].split(",")]

W, H, FPS = 1080, 1920, 30
SW, SH = 1080, 1920
FONT = "/usr/share/fonts/truetype/nanum/NanumSquareRoundEB.ttf"
PEN = "/usr/share/fonts/truetype/nanum/NanumPen.ttf"
EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
NAVY = (20, 36, 96)
YELLOW = (255, 216, 77)
WHITE = (255, 255, 255)
CORAL = (255, 77, 109)

# edit decision list: (out_start, out_end, src_start, speed, kind, camera keys [(out_t, cx, cy, z)])
# speed 0.5 = slow motion (frame-interpolated)
EDL = [
    (0.0, 2.0, 3.4, 0.5, "crop", [(0.0, 510, 900, 1.45), (2.0, 510, 900, 1.7)]),
    (2.0, 4.0, 0.0, 1, "crop", [(2.0, 540, 960, 1.15), (4.0, 540, 960, 1.2)]),
    (4.0, 5.4, 2.0, 1, "crop", [(4.0, 540, 960, 1.2), (5.4, 530, 940, 1.25)]),
    (5.4, 7.4, 3.4, 0.5, "crop", [(5.4, 520, 920, 1.3), (6.6, 510, 900, 1.75), (7.4, 510, 900, 1.8)]),
    (7.4, 9.0, 4.4, 2, "crop", [(7.4, 520, 880, 1.1), (9.0, 500, 860, 1.12)]),
    (9.0, 11.0, 7.6, 1, "crop", [(9.0, 470, 820, 1.2), (11.0, 480, 820, 1.25)]),
    (11.0, 13.0, 9.6, 2, "crop", [(11.0, 500, 820, 1.15), (13.0, 520, 820, 1.15)]),
    (13.0, 14.4, 13.6, 1, "crop", [(13.0, 540, 800, 1.2), (14.4, 540, 800, 1.32)]),
    (14.4, 15.4, 15.0, 1, "crop", [(14.4, 540, 820, 1.25), (15.4, 540, 820, 1.25)]),
    (15.4, 17.0, 16.0, 2, "crop", [(15.4, 520, 820, 1.15), (17.0, 520, 820, 1.15)]),
    (17.0, 18.6, 19.3, 1, "crop", [(17.0, 520, 820, 1.2), (18.6, 520, 820, 1.25)]),
    (18.6, 19.6, 23.0, 1, "crop", [(18.6, 470, 840, 1.25), (19.6, 460, 840, 1.32)]),
    (19.6, 21.6, 24.4, 1, "crop", [(19.6, 400, 880, 1.2), (21.6, 400, 880, 1.28)]),
    (21.6, 24.4, 25.4, 0, "card", None),
]
MAIN_T = 24.4
OUTRO_T = MAIN_T
TOTAL_N = int(round((MAIN_T + 2.8) * FPS))
SLOW = [(0.0, 2.0), (5.4, 7.4)]
SOUR_T = 6.6                           # the pucker (src 4.0)
DONE_T = 20.75                         # 'one more bite' + confetti
WANT = [9.9, 14.65, 18.4, DONE_T]      # mouth-open '아~' moments (src 8.5, 15.25, 20.7, 25.45)
PHOTO_SOUR, PHOTO_WANT = 4.0, 25.4

BURSTS = [(SOUR_T, "셔!!", (840, 660)), (9.9, "또 줘!", (850, 1180)), (DONE_T, "한 입 더!", (840, 1180))]
CAPTIONS = [
    (2.0, 4.0, "생애 첫 [사과] 도전! 🍎"),
    (4.0, 5.4, "아삭아삭~ 맛있…? 😋"),
    (5.4, 6.6, "어…? 🤔"),
    (6.6, 7.4, "으…! [셔]!!! 😖"),
    (7.4, 9.0, "잠시 정신 수습 중… 😵"),
    (9.0, 9.9, "근데 이상하다…?"),
    (9.9, 11.0, "[또] 주세요! 아~ 😮"),
    (11.0, 13.0, "셔도 멈출 수 없는 맛 🍎"),
    (13.0, 14.4, "앗… 가져가지 마요 🥺"),
    (14.4, 15.4, "한 입만 더! 아~ 😮"),
    (15.4, 17.0, "오물오물~ 또 냠냠 😋"),
    (17.0, 18.6, "더 주세요~ 👅"),
    (18.6, 19.6, "시큼… 그래도… 🥺"),
    (19.6, 21.6, "결국 [한 입 더]! 😆"),
]
# gauge values (%) reached at each moment: sourness, wanting-more
SOUR_P = [(5.4, 0), (6.5, 40), (SOUR_T, 100)]
WANT_P = [(9.0, 0), (9.9, 35), (14.65, 60), (18.4, 80), (DONE_T, 100)]


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

def keyed(keys, t):
    if t <= keys[0][0]: return keys[0][1:]
    for (t0, *a), (t1, *b) in zip(keys, keys[1:]):
        if t0 <= t <= t1:
            k = smooth((t - t0) / (t1 - t0))
            return [lerp(p, q, k) for p, q in zip(a, b)]
    return keys[-1][1:]

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
    return o >= 0x1F000 or 0x2600 <= o <= 0x27BF or 0x2300 <= o <= 0x23FF or 0x2B00 <= o <= 0x2BFF

def runs(text):
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

def with_shadow(im, dy, blur, alpha):
    sh = Image.new("RGBA", (im.width + 4 * blur, im.height + 4 * blur + dy), (10, 16, 48, 0))
    a = im.getchannel("A").point(lambda v: v * alpha // 255)
    blk = Image.new("RGBA", im.size, (10, 16, 48, 255)); blk.putalpha(a)
    sh.alpha_composite(blk, (2 * blur, 2 * blur + dy))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    sh.alpha_composite(im, (2 * blur, 2 * blur))
    return sh

def text_line(text, size, fill=WHITE, hl=YELLOW, stroke=NAVY, sw=None, path=FONT, shadow=True):
    sw = sw if sw is not None else max(4, size // 8)
    f = font(size, path)
    asc, desc = f.getmetrics()
    pad = sw + 16
    parts, x = [], 0
    for kind, s in runs(text):
        if kind == "emoji":
            em = emoji_img(s, int(size * (0.85 if path == PEN else 1.08)))
            parts.append((kind, em, x)); x += em.width + int(size * 0.08)
        else:
            parts.append((kind, s, x)); x += int(f.getlength(s))
    im = Image.new("RGBA", (int(x) + 2 * pad, asc + desc + 2 * pad), (0, 0, 0, 0))
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

def pill(text, size, bg, fg, h):
    t = text_line(text, size, fill=fg, stroke=bg[:3], sw=0, shadow=False)
    im = Image.new("RGBA", (t.width + 30, h + 20), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([10, 10, t.width + 20, h + 10], radius=h // 2, fill=bg)
    im.alpha_composite(t, (15, (h + 20 - t.height) // 2 + 2))
    return with_shadow(im, 6, 8, 120)



# ---------------------------------------------------------------- sprites (EP01 look)
HOOK = [text_line("생애 첫 사과 먹고", 96), text_line("이 표정 [실화]?! 😖", 104)]
HOOK_Y = (500, 640)

def caption_img(text, size=86, max_w=960):
    im = text_line(text, size)
    while im.width > max_w and size > 74:
        size -= 4; im = text_line(text, size)
    if im.width <= max_w or " " not in text:
        return im
    words = text.split(" ")
    best = min(range(1, len(words)), key=lambda k: abs(len(" ".join(words[:k])) - len(" ".join(words[k:]))))
    return stack([text_line(" ".join(words[:best]), size), text_line(" ".join(words[best:]), size)], gap=-30)
CAP_IMG = [caption_img(c[2]) for c in CAPTIONS]
CAP_Y = 1420                       # below the face and the apple

def title_pill():
    size = 62
    while True:
        t = text_line("생애 첫 사과 먹는 [8개월] 아기 🍎", size, fill=NAVY, hl=(232, 74, 95), stroke=WHITE, sw=0)
        if t.width + 60 <= 1000 or size <= 44: break
        size -= 2
    w, h = t.width + 20, int(size * 2)
    im = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([20, 20, 20 + w, 20 + h], radius=h // 2, fill=(255, 255, 255, 240), outline=YELLOW, width=7)
    im.alpha_composite(t, ((im.width - t.width) // 2, (im.height - t.height) // 2 + 2))
    return with_shadow(im, 6, 8, 120), text_line("@아톰문 · 승유 성장일기", 38, sw=5)
TITLE, TITLE_TAG = title_pill()
SPEED = pill("⏩ 2배속", 40, (20, 36, 96, 220), WHITE, 72)
SLOWMO = pill("🐢 슬로우 모션", 40, (255, 77, 109, 230), WHITE, 72)

def burst(label):
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
    n = len(label.replace(" ", ""))
    size = 150 if n <= 2 else (112 if n <= 3 else 92)
    t = text_line(label, size, fill=CORAL, stroke=WHITE, sw=14)
    im.alpha_composite(t, (c - t.width // 2, c - t.height // 2 - 6))
    return im
BURST = {label: burst(label) for _, label, _ in BURSTS}

G_SOUR = text_line("🍋 신맛 지수", 32, sw=5, shadow=False)
G_WANT = text_line("🍎 또 먹고 싶음", 32, sw=5, shadow=False)
MAX_TXT = text_line("MAX", 34, fill=WHITE, sw=0, shadow=False)
_g_cache = {}
def gauges(ps, pw):
    """Navy panel with two bars: sourness and wanting-more."""
    key = (int(ps), int(pw))
    if key in _g_cache: return _g_cache[key]
    w, h = 420, 170
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=28, fill=(20, 36, 96, 215))
    for row, (lab, p, col) in enumerate([(G_SOUR, ps, (190, 220, 60)), (G_WANT, pw, CORAL)]):
        y = 8 + 80 * row
        im.alpha_composite(lab, (4, y - 10))
        bx0, by0, bx1, by1 = 22, y + 44, 300, y + 70
        d.rounded_rectangle([bx0, by0, bx1, by1], radius=13, fill=(255, 255, 255, 235))
        fx = bx0 + (bx1 - bx0) * p / 100
        if fx > bx0 + 8:
            d.rounded_rectangle([bx0, by0, fx, by1], radius=13, fill=col)
        if p >= 99.5:
            d.rounded_rectangle([310, y + 36, 410, y + 78], radius=18, fill=CORAL)
            im.alpha_composite(MAX_TXT, (360 - MAX_TXT.width // 2, y + 57 - MAX_TXT.height // 2))
        else:
            t = text_line(f"{int(p)}%", 34, fill=YELLOW, sw=0, shadow=False)
            im.alpha_composite(t, (312, y + 30))
    _g_cache[key] = with_shadow(im, 6, 8, 120)
    return _g_cache[key]

def level(keys, t):
    if t < keys[0][0]: return 0
    for (t0, p0), (t1, p1) in zip(keys, keys[1:]):
        if t < t1:
            return p0 + (p1 - p0) * ease_out((t - t1 + 0.5) / 0.5) if t >= t1 - 0.5 else p0
    return keys[-1][1]

rng = random.Random(16)
AMBIENT = []
_t = 0.3
while _t < MAIN_T:
    AMBIENT.append(dict(t0=_t, x=rng.uniform(70, 1010), v=rng.uniform(170, 300), s=rng.uniform(40, 62),
                        wob=rng.uniform(10, 26), fq=rng.uniform(0.8, 1.8), ph=rng.uniform(0, 6.28), e=rng.choice("✨🍎")))
    _t += rng.uniform(0.6, 1.1)
CONFETTI = [dict(x=rng.uniform(0, W), v=rng.uniform(380, 650), d=rng.uniform(0, 0.5), rot=rng.uniform(0, 360),
                 spin=rng.uniform(-400, 400), c=rng.choice([YELLOW, CORAL, (90, 200, 255), (130, 230, 150), WHITE]),
                 w=rng.randint(14, 24), h=rng.randint(22, 34)) for _ in range(70)]
SPARK = emoji_img("✨", 90)
LEMON = emoji_img("🍋", 110)
APPLE = emoji_img("🍎", 90)
HEARTY = emoji_img("💛", 70)
SOUR_LINES = text_line("시큼", 64, fill=(200, 230, 60), stroke=NAVY, sw=8)

def icon_badge(size=470):
    ic = Image.open(f"{S}/icon/atommoon_icon_800.png").convert("RGBA").resize((size, size), Image.LANCZOS)
    m = Image.new("L", (size, size), 0); ImageDraw.Draw(m).ellipse([0, 0, size - 1, size - 1], fill=255)
    ic.putalpha(m)
    ring = Image.new("RGBA", (size + 28, size + 28), (0, 0, 0, 0))
    ImageDraw.Draw(ring).ellipse([0, 0, size + 27, size + 27], fill=WHITE)
    ring.alpha_composite(ic, (14, 14))
    return with_shadow(ring, 10, 14, 160)
ICON = icon_badge()
OUT_NAME = text_line("아톰문", 128, sw=14)
OUT_SUB = text_line("헬멧 쓴 아기 [승유]의 성장 일기", 50, sw=7)

def sub_button(on):
    w, h = 400, 128
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=h // 2, fill=(229, 229, 229) if on else (255, 0, 51))
    d.text((w / 2, h / 2 + 2), "구독중" if on else "구독", font=font(64), fill=(60, 60, 60) if on else WHITE, anchor="mm")
    return with_shadow(im, 8, 10, 140)
SUB_OFF, SUB_ON = sub_button(False), sub_button(True)
POINTER = emoji_img("👆", 120)
HEART = emoji_img("💙", 70)

# review card pieces
INK = (52, 58, 84)
CARD_HEAD = text_line("🍎 승유의 첫 사과 리뷰", 62, fill=NAVY, stroke=WHITE, sw=0, shadow=False)
LAB_SOUR = text_line("첫 입 😖", 54, fill=INK, stroke=WHITE, sw=0, path=PEN, shadow=False)
LAB_WANT = text_line("그래도 또! 😮", 54, fill=INK, stroke=WHITE, sw=0, path=PEN, shadow=False)
CARD_ROWS = [text_line(c, 60, fill=INK, stroke=WHITE, sw=0, path=PEN, shadow=False) for c in
             ["맛: ⭐⭐⭐⭐⭐", "신맛: 🍋🍋🍋🍋🍋 (MAX)", "한 줄 평: 셔도 또 먹을래요!"]]
CARD_DATE = text_line("2026.11.12 · 승유 8개월", 40, fill=(140, 140, 160), stroke=WHITE, sw=0, path=PEN, shadow=False)

def stamp():
    t1 = text_line("재구매", 46, fill=CORAL, stroke=WHITE, sw=0, shadow=False)
    t2 = text_line("확정 💯", 60, fill=CORAL, stroke=WHITE, sw=0, shadow=False)
    w, h = max(t1.width, t2.width) + 50, t1.height + t2.height + 10
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([4, 4, w - 5, h - 5], radius=26, fill=(255, 255, 255, 120), outline=CORAL, width=8)
    im.alpha_composite(t1, ((w - t1.width) // 2, 8))
    im.alpha_composite(t2, ((w - t2.width) // 2, t1.height - 6))
    return im
STAMP = stamp()


# ---------------------------------------------------------------- views
def crop_view(frame, cx, cy, z, out_w=W, out_h=H):
    h = SH / z; w = h * out_w / out_h
    if w > SW: w = SW; h = w * out_h / out_w
    x0 = min(max(cx - w / 2, 0), SW - w); y0 = min(max(cy - h / 2, 0), SH - h)
    im = frame.resize((out_w, out_h), Image.LANCZOS, box=(x0, y0, x0 + w, y0 + h))
    return im.filter(ImageFilter.UnsharpMask(radius=2, percent=40, threshold=2))

def burst_zoom(t):
    z = 1.0
    for tb, _, _ in BURSTS:
        if tb - 0.08 <= t <= tb + 1.4:
            k = ease_out((t - tb + 0.08) / 0.16) * (1 - smooth((t - tb - 0.8) / 0.6))
            z = max(z, 1 + 0.16 * k)
    return z

def shake(t):
    dx = dy = 0.0
    for tb, _, _ in BURSTS:
        dt = t - tb
        if 0 <= dt <= 0.45:
            amp = 12 * math.exp(-dt / 0.12)
            dx += amp * math.sin(2 * math.pi * 17 * dt); dy += amp * math.cos(2 * math.pi * 13 * dt)
    return dx, dy


def in_slow(t):
    return any(a <= t < b for a, b in SLOW)

def overlays(img, t):
    for b in AMBIENT:
        dt = t - b["t0"]
        if dt < 0: continue
        y = 1980 - b["v"] * dt
        if y < 420: continue
        x = b["x"] + b["wob"] * math.sin(b["fq"] * 2 * math.pi * dt + b["ph"])
        a = min(1, dt / 0.4) * min(1, (y - 420) / 300) * 0.45
        put(img, scaled(emoji_img(b["e"], int(b["s"])), 1, a), x, y)
    for ts in (1.05, SOUR_T):           # the pucker: lemons fly out of the face, '시큼' wobbles in
        dt = t - ts
        if 0 <= dt <= 1.0:
            for k in range(6):
                ang = -math.pi / 2 + (k - 2.5) * 0.55
                r = 120 + 520 * ease_out(dt / 0.7)
                put(img, scaled(LEMON, 0.6 + 0.3 * ease_out(dt / 0.3), 1 - clamp01((dt - 0.7) / 0.3), rot=40 * math.sin(dt * 10 + k)),
                    540 + r * math.cos(ang) * 1.3, 860 + r * math.sin(ang) * 0.9 + 300)
            if ts == SOUR_T:
                s = ease_out_back(dt / 0.25) * (1 + 0.08 * math.sin(dt * 30))
                put(img, scaled(SOUR_LINES, max(0.05, s), 1 - clamp01((dt - 0.75) / 0.25), rot=12), 240, 1060)
    for tw in WANT:                     # little apples + hearts float up from the open mouth
        dt = t - tw
        if 0 <= dt <= 0.9:
            for k in range(3):
                kt = dt - 0.1 * k
                if kt < 0: continue
                x = 540 + (k - 1) * 150 + 20 * math.sin(kt * 8)
                put(img, scaled(APPLE if k != 1 else HEARTY, 0.5 + 0.5 * ease_out_back(kt / 0.3), 1 - clamp01((kt - 0.6) / 0.3)),
                    x, 1180 - 300 * ease_out(kt / 0.8))
    for tb, label, (bx, by) in BURSTS:
        dt = t - tb
        if -0.02 <= dt <= 0.95:
            s = 0.25 + 0.75 * ease_out_back(dt / 0.22)
            s *= 1 + 0.04 * math.sin(dt * 28) * math.exp(-dt * 4)
            a = 1 - clamp01((dt - 0.75) / 0.2)
            put(img, scaled(BURST[label], s * 0.72, a, rot=-8 + 6 * math.sin(dt * 9)), bx, by)
    dt = t - DONE_T
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
            put(img, scaled(SPARK, max(0.05, s)), 540 + 330 * math.cos(ang), 900 + 260 * math.sin(ang))
    return img

def chrome(img, t, seg, captions=True):
    """Hook, title pill, the two gauges, speed badges and captions (EP01 look)."""
    if t < 2.1:
        out = clamp01((t - 1.85) / 0.2)
        for k, (line, y) in enumerate(zip(HOOK, HOOK_Y)):
            lt = t - 0.08 - 0.32 * k
            if lt < 0: continue
            s = (0.3 + 0.7 * ease_out_back(lt / 0.3)) * (1 + 0.035 * math.sin(lt * 7))
            put(img, scaled(line, s * (1 - 0.3 * out), 1 - out), 540, y - 140 * out)
    if t >= 1.7:
        k = ease_out_back((t - 1.7) / 0.45)
        put(img, TITLE, 540, -120 + (250 + 120) * k)
        put(img, scaled(TITLE_TAG, 1, clamp01((t - 2.0) / 0.3)), 540, 358)
    if 5.4 <= t < 21.6:
        a = clamp01((t - 5.4) / 0.25) * clamp01((21.6 - t) / 0.2)
        ps, pw = level(SOUR_P, t), level(WANT_P, t)
        bump = 1 + 0.1 * max([math.exp(-((t - tp) / 0.12) ** 2) for tp, _ in SOUR_P[1:] + WANT_P[1:]])
        put(img, scaled(gauges(ps, pw), bump, a), 240, 520)
    if seg[3] == 2:
        a = clamp01((t - seg[0]) / 0.2) * clamp01((seg[1] - t) / 0.15)
        put(img, scaled(SPEED, 1, a), 920, 470)
    if in_slow(t) and t >= 2.0:
        a = clamp01((t - seg[0]) / 0.2) * clamp01((seg[1] - t) / 0.15)
        put(img, scaled(SLOWMO, 1, a), 880, 470)
    if not captions:
        return
    for (a, b, txt), cap in zip(CAPTIONS, CAP_IMG):
        if a <= t < b:
            lt, rem = t - a, b - t
            s = 0.55 + 0.45 * ease_out_back(lt / 0.24)
            al = clamp01(lt / 0.08)
            if rem < 0.1:
                al *= rem / 0.1
            if "!" in txt:
                s *= 1 + 0.05 * math.sin(lt * 20) * math.exp(-lt * 3)
            put(img, scaled(cap, s, al), 540, CAP_Y)

def draw_crop(frame, t, seg):
    cx, cy, z = keyed(seg[5], t)
    z *= burst_zoom(t)
    lt = t - seg[0]
    z *= 1 + 0.06 * (1 - ease_out(lt / 0.25)) if seg[0] > 0 else 1      # settle on every cut
    dx, dy = shake(t)
    img = crop_view(frame, cx + dx, cy + dy, z)
    if in_slow(t):                     # soft vignette in slow motion
        img = Image.composite(img, Image.blend(img, Image.new("RGB", (W, H), (10, 16, 48)), 0.4), VIGNETTE)
    st = t - SOUR_T                    # a sour yellow-green flash on the pucker
    if 0 <= st < 0.35:
        img = Image.blend(img, Image.new("RGB", (W, H), (220, 240, 90)), 0.35 * (1 - st / 0.35))
    overlays(img, t)
    chrome(img, t, seg)
    return img

def _vignette():
    m = Image.new("L", (W // 8, H // 8), 0)
    ImageDraw.Draw(m).ellipse([-20, 10, W // 8 + 20, H // 8 - 10], fill=255)
    return m.filter(ImageFilter.GaussianBlur(14)).resize((W, H), Image.BILINEAR)
VIGNETTE = _vignette()

_card = {}
def draw_card(frame, sour, want, t, seg):
    """Freeze with a first-apple review: two photos (sour / want more), rows tick in, then the stamp."""
    lt = t - seg[0]
    if "bg" not in _card:
        bg = crop_view(frame, 400, 880, 1.2).filter(ImageFilter.GaussianBlur(20))
        _card["bg"] = Image.blend(bg, Image.new("RGB", (W, H), (14, 26, 70)), 0.45)
        card = Image.new("RGBA", (940, 1040), (0, 0, 0, 0)); d = ImageDraw.Draw(card)
        d.rounded_rectangle([0, 0, 939, 1039], radius=26, fill=(255, 252, 240, 255), outline=YELLOW, width=8)
        d.rounded_rectangle([0, 0, 939, 120], radius=26, fill=YELLOW)
        d.rectangle([0, 90, 939, 120], fill=YELLOW)
        card.alpha_composite(CARD_HEAD, ((940 - CARD_HEAD.width) // 2, (120 - CARD_HEAD.height) // 2 + 4))
        for fr, box, x, rot, lab in [(sour, (250, 520, 750, 1130), 60, 3, LAB_SOUR), (want, (127, 480, 607, 1066), 500, -3, LAB_WANT)]:
            ph = Image.new("RGBA", (360, 430), WHITE); ph.paste(fr.resize((340, 410), Image.LANCZOS, box=box), (10, 10))
            card.alpha_composite(with_shadow(ph.rotate(rot, resample=Image.BICUBIC, expand=True), 6, 8, 110), (x, 140))
            card.alpha_composite(lab, (x + 200 - lab.width // 2, 600))
        for k in range(3):
            y = 760 + 80 * k
            d.line([(60, y), (880, y)], fill=(230, 226, 210), width=3)
        card.alpha_composite(CARD_DATE, (940 - CARD_DATE.width - 40, 970))
        _card["card"] = card
    img = _card["bg"].copy()
    card = _card["card"].copy()
    for k, row in enumerate(CARD_ROWS):
        rt = lt - 0.35 - 0.3 * k
        if rt > 0:
            s = 0.4 + 0.6 * ease_out_back(rt / 0.22)
            r = scaled(row, s)
            card.alpha_composite(r, (int(70 + row.width * (1 - s) / 2), int(688 + 80 * k + row.height * (1 - s) / 2)))
    st = lt - 1.6
    if st > 0:
        s = 2.2 - 1.2 * ease_out(st / 0.16)
        sp = scaled(STAMP, s, clamp01(st / 0.08), rot=-12)
        card.alpha_composite(sp, (int(760 - sp.width / 2), int(780 - sp.height / 2)))
    cs = 1.18 - 0.18 * ease_out_back(lt / 0.35)
    shake_y = 10 * math.exp(-max(0, st) / 0.08) * math.sin(st * 60) if st > 0 else 0
    put(img, scaled(with_shadow(card, 16, 20, 170), cs, rot=-2 + 2 * (1 - smooth(lt / 0.5))), 540, 1040 + shake_y)
    if lt < 0.25:
        img = Image.blend(img, Image.new("RGB", (W, H), (255, 255, 255)), 0.7 * (1 - lt / 0.25))
    chrome(img, t, seg, captions=False)
    return img

def draw_outro(last, t):
    dt = t - OUTRO_T
    base = last.filter(ImageFilter.GaussianBlur(18 * smooth(dt / 0.4))) if dt > 0 else last
    k = smooth(dt / 0.4)
    img = Image.blend(base, Image.new("RGB", (W, H), (14, 26, 70)), 0.58 * k)
    for j in range(12):
        y = (1900 - ((dt * 160 + j * 170) % 1700))
        x = 90 + (j * 83) % 900 + 18 * math.sin(dt * 2 + j)
        put(img, scaled(emoji_img("✨" if j % 2 else "🎵", 40 + (j * 7) % 26), 1, 0.45 * k), x, y)
    s = ease_out_back((dt - 0.12) / 0.45)
    if s > 0:
        put(img, scaled(ICON, max(0.05, s), rot=4 * math.sin(dt * 3)), 540, 690)
    s = ease_out_back((dt - 0.35) / 0.35)
    if s > 0:
        put(img, scaled(OUT_NAME, max(0.05, s)), 540, 1030)
    a = clamp01((dt - 0.5) / 0.3)
    if a > 0:
        put(img, scaled(OUT_SUB, 1, a), 540, 1140 + 20 * (1 - a))
    s = ease_out_back((dt - 0.65) / 0.35)
    tap = 1.4
    if s > 0:
        press = 1 - 0.12 * math.exp(-((dt - tap) / 0.07) ** 2)
        put(img, scaled(SUB_ON if dt >= tap else SUB_OFF, max(0.05, s) * press), 540, 1290)
    pa = clamp01((dt - 0.9) / 0.2) * (1 - clamp01((dt - tap - 0.5) / 0.3))
    if pa > 0:
        pk = smooth((dt - 0.95) / (tap - 0.95))
        put(img, scaled(POINTER, 1, pa), lerp(800, 600, pk), lerp(1520, 1370, pk))
    if dt >= tap:
        ht = dt - tap
        for j in range(6):
            spread = [0.0, 0.12, 0.25][j % 3]
            ang = math.pi + spread if j < 3 else -spread
            r = 170 + 230 * ease_out(ht / 0.8)
            put(img, scaled(HEART, 0.6 + 0.4 * ease_out(ht / 0.3), 1 - clamp01((ht - 0.7) / 0.4)),
                540 + r * math.cos(ang), 1290 + r * math.sin(ang))
    return img



# ---------------------------------------------------------------- io
def frames(start, dur, speed):
    if speed > 1:
        tf = "setpts=PTS/%d,fps=30," % speed
    elif speed < 1:
        tf = "setpts=%g*PTS,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1," % (1 / speed)
    else:
        tf = "fps=30,"
    vf = tf + "hqdn3d=1.5:1.5:3:3,eq=saturation=1.1:contrast=1.04"
    cmd = ["ffmpeg", "-v", "fatal", "-ss", f"{start:.3f}", "-t", f"{dur * speed + 0.3:.3f}", "-i", SRC,
           "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]
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
                                "-r", str(FPS), "-i", "-", "-c:v", "libx264", "-preset", "slow", "-crf", "16",
                                "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709",
                                "-color_trc", "bt709", "-movflags", "+faststart", OUT], stdin=subprocess.PIPE)
    def emit(i, img):
        if want is None:
            enc.stdin.write(img.tobytes())
        elif i in want:
            img.save(f"{OUT}/still_{want[i]:05.2f}.jpg", quality=88)
    def needed(i):
        return want is None or i in want or i >= int(round(MAIN_T * FPS)) - 1
    i = 0
    last = None
    for seg in EDL:
        o0, o1, s0, speed, kind = seg[:5]
        n = int(round((o1 - o0) * FPS))
        if kind == "card":
            fr = next(frames(s0, 0.1, 1))
            sour_fr, want_fr = next(frames(PHOTO_SOUR, 0.1, 1)), next(frames(PHOTO_WANT, 0.1, 1))
            for j in range(n):
                if needed(i):
                    last = draw_card(fr, sour_fr, want_fr, i / FPS, seg); emit(i, last)
                i += 1
            continue
        j = 0
        for fr in frames(s0, o1 - o0, speed):
            if j >= n: break
            if needed(i):
                img = draw_crop(fr, i / FPS, seg); last = img
                emit(i, img)
            i += 1; j += 1
        while j < n:                       # pad if the decoder came up short
            if last is not None: emit(i, last)
            i += 1; j += 1
    while i < TOTAL_N:
        if needed(i):
            emit(i, draw_outro(last, i / FPS))
        i += 1
    if enc:
        enc.stdin.close(); enc.wait()
    print("frames", i)

main()
