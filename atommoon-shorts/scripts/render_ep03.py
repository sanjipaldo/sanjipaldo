"""EP03 '다리 꼬꼬' Short in the EP01 style, edited from a 62 s landscape clip:
hook teaser -> 2x reading -> 2x roll -> pan reveal of the crossed legs -> polaroid freeze ->
leg lift -> split screen (상체 열공 / 하체 사장님) -> relaxed pose -> kicks -> subscribe card.

usage: render_ep03.py SCRATCH SRC.mp4 OUT.mp4|STILLS_DIR [--stills t1,t2,...]
"""
import math, random, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
STILLS = None
if "--stills" in sys.argv:
    STILLS = [float(v) for v in sys.argv[sys.argv.index("--stills") + 1].split(",")]

W, H, FPS = 1080, 1920, 30
SW, SH = 2336, 1080
FONT = "/usr/share/fonts/truetype/nanum/NanumSquareRoundEB.ttf"
PEN = "/usr/share/fonts/truetype/nanum/NanumPen.ttf"
EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
NAVY = (20, 36, 96)
YELLOW = (255, 216, 77)
WHITE = (255, 255, 255)
CORAL = (255, 77, 109)

# edit decision list: (out_start, out_end, src_start, speed, kind, camera keys [(out_t, cx, cy, z)])
EDL = [
    (0.0, 2.0, 48.0, 1, "crop", [(0.0, 1480, 540, 1.15), (2.0, 1480, 540, 1.22)]),
    (2.0, 7.0, 4.0, 2, "crop", [(2.0, 1300, 540, 1.0), (7.0, 1260, 540, 1.03)]),
    (7.0, 11.0, 22.0, 2, "crop", [(7.0, 1250, 540, 1.0), (9.0, 1450, 540, 1.0), (10.0, 1300, 540, 1.0), (11.0, 1150, 540, 1.0)]),
    (11.0, 15.0, 31.0, 1, "crop", [(11.0, 900, 540, 1.0), (12.4, 900, 540, 1.0), (13.0, 1300, 540, 1.0), (15.0, 1360, 540, 1.03)]),
    (15.0, 16.6, 36.0, 0, "polaroid", None),
    (16.6, 19.6, 43.6, 1, "crop", [(16.6, 1300, 540, 1.0), (19.6, 1300, 540, 1.03)]),
    (19.6, 25.6, 47.6, 1, "split", None),
    (25.6, 28.6, 54.0, 1, "crop", [(25.6, 1380, 540, 1.0), (28.6, 1380, 540, 1.06)]),
    (28.6, 31.6, 57.5, 1, "crop", [(28.6, 1200, 540, 1.0), (31.6, 1200, 540, 1.05)]),
]
MAIN_T = 31.6
OUTRO_T = MAIN_T
TOTAL_N = int(round((MAIN_T + 2.8) * FPS))

BURSTS = [(13.0, "꼬꼬?!", (820, 640)), (18.5, "번쩍!", (800, 1470)), (30.4, "100점!", (800, 640))]
TITLE_HIDE = (17.3, 19.5)      # the lifted foot reaches the top of the frame: let it through
CAPTIONS = [
    (2.0, 4.5, "오늘은 독서하는 날 📖"),
    (4.5, 7.0, "엎드려서 [열공] 중 🤓"),
    (7.0, 9.0, "어…? 자세가 바뀐다 🔄"),
    (9.0, 11.0, "슬쩍~ 옆으로 눕더니…"),
    (11.0, 13.0, "책 읽는 자세 보소 😎"),
    (13.0, 15.0, "근데 [다리]가…?! 🦵"),
    (16.6, 18.5, "이번엔 다리를…"),
    (18.5, 19.6, "[번쩍]! 🦵"),
    (25.6, 27.1, "여유 그 자체… 💼"),
    (27.1, 28.6, "누가 [7개월]이래요? 😂"),
    (28.6, 30.4, "신나서 다리 까딱까딱 🎵"),
    (30.4, MAIN_T, "오늘의 포즈 [100점] 💯"),
]
SPLIT_TOP = (900, 470, 900)      # crop centre x, y and width for the upper body (reading)
SPLIT_BOT = (1560, 520, 900)     # ... and for the crossed legs


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
    return o >= 0x1F000 or 0x2600 <= o <= 0x27BF or 0x2300 <= o <= 0x23FF

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
HOOK = [text_line("7개월 아기가", 104), text_line("[다리]를 꼰다고?! 😲", 104)]

def caption_img(text, size=86, max_w=900):
    im = text_line(text, size)
    if im.width <= max_w or " " not in text:
        return im
    words = text.split(" ")
    best = min(range(1, len(words)), key=lambda k: abs(len(" ".join(words[:k])) - len(" ".join(words[k:]))))
    return stack([text_line(" ".join(words[:best]), size), text_line(" ".join(words[best:]), size)], gap=-30)
CAP_IMG = [caption_img(c[2]) for c in CAPTIONS]
CAP_Y = 1255

def title_pill():
    size = 62
    while True:
        t = text_line("다리 꼬고 책 읽는 [7개월] 아기 😎", size, fill=NAVY, hl=(232, 74, 95), stroke=WHITE, sw=0)
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
    size = 150 if len(label) <= 2 else (112 if len(label) <= 3 else 96)
    t = text_line(label, size, fill=CORAL, stroke=WHITE, sw=14)
    im.alpha_composite(t, (c - t.width // 2, c - t.height // 2 - 6))
    return im
BURST = {label: burst(label) for _, label, _ in BURSTS}

LABEL_TOP = pill("📖 상체: 열공 모드", 50, (255, 255, 255, 235), NAVY, 92)
LABEL_BOT = pill("🦵 하체: 사장님 모드", 50, (255, 216, 77, 245), NAVY, 92)
POLA_TEXT = text_line("다리 꼬꼬 포즈 포착 📸", 70, fill=(52, 58, 84), stroke=WHITE, sw=0, path=PEN, shadow=False)
POLA_DATE = text_line("2026.10.29 · 승유 7개월", 40, fill=(140, 140, 160), stroke=WHITE, sw=0, path=PEN, shadow=False)
CLICK = text_line("찰칵!", 84, fill=WHITE, stroke=CORAL, sw=10)

rng = random.Random(11)
AMBIENT = []
_t = 0.3
while _t < MAIN_T:
    AMBIENT.append(dict(t0=_t, x=rng.uniform(70, 1010), v=rng.uniform(170, 300), s=rng.uniform(40, 62),
                        wob=rng.uniform(10, 26), fq=rng.uniform(0.8, 1.8), ph=rng.uniform(0, 6.28), e=rng.choice("✨🎵")))
    _t += rng.uniform(0.6, 1.1)
CONFETTI = [dict(x=rng.uniform(0, W), v=rng.uniform(380, 650), d=rng.uniform(0, 0.5), rot=rng.uniform(0, 360),
                 spin=rng.uniform(-400, 400), c=rng.choice([YELLOW, CORAL, (90, 200, 255), (130, 230, 150), WHITE]),
                 w=rng.randint(14, 24), h=rng.randint(22, 34)) for _ in range(70)]
SPARK = emoji_img("✨", 90)

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

def overlays(img, t, seg_start):
    for b in AMBIENT:
        dt = t - b["t0"]
        if dt < 0: continue
        y = 1980 - b["v"] * dt
        if y < 420: continue
        x = b["x"] + b["wob"] * math.sin(b["fq"] * 2 * math.pi * dt + b["ph"])
        a = min(1, dt / 0.4) * min(1, (y - 420) / 300) * 0.45
        put(img, scaled(emoji_img(b["e"], int(b["s"])), 1, a), x, y)
    for tb, label, (bx, by) in BURSTS:
        dt = t - tb
        if -0.02 <= dt <= 0.95:
            s = 0.25 + 0.75 * ease_out_back(dt / 0.22)
            s *= 1 + 0.04 * math.sin(dt * 28) * math.exp(-dt * 4)
            a = 1 - clamp01((dt - 0.75) / 0.2)
            put(img, scaled(BURST[label], s * 0.72, a, rot=-8 + 6 * math.sin(dt * 9)), bx, by)
    dt = t - 30.4
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
    # cut-in: a quick settle from a slight zoom at every new shot
    return img

def chrome(img, t, seg):
    """Hook, title pill, speed badge and captions (EP01 positions)."""
    if t < 2.1:
        out = clamp01((t - 1.85) / 0.2)
        for k, (line, y) in enumerate(zip(HOOK, (990, 1135))):
            lt = t - 0.08 - 0.32 * k
            if lt < 0: continue
            s = (0.3 + 0.7 * ease_out_back(lt / 0.3)) * (1 + 0.035 * math.sin(lt * 7))
            put(img, scaled(line, s * (1 - 0.3 * out), 1 - out), 540, y - 140 * out)
        put(img, scaled(emoji_img("🦵", 120), 1, 1 - out), 1240 - 1500 * smooth(t / 2.0), 1330 + 22 * math.sin(t * 9))
        put(img, scaled(emoji_img("📖", 90), 1, 1 - out), -160 + 1400 * smooth((t - 0.3) / 1.8), 820 + 18 * math.sin(t * 8 + 1))
    if t >= 1.7:
        k = ease_out_back((t - 1.7) / 0.45)
        hide = smooth((t - TITLE_HIDE[0]) / 0.3) * (1 - smooth((t - TITLE_HIDE[1]) / 0.35))
        put(img, TITLE, 540, -120 + (250 + 120) * k - 420 * hide)
        put(img, scaled(TITLE_TAG, 1, clamp01((t - 2.0) / 0.3) * (1 - hide)), 540, 358)
    if seg[3] == 2:
        a = clamp01((t - seg[0]) / 0.2) * clamp01((seg[1] - t) / 0.15)
        put(img, scaled(SPEED, 1, a), 150, 450)
    for (a, b, txt), cap in zip(CAPTIONS, CAP_IMG):
        if a <= t < b:
            lt, rem = t - a, b - t
            s = 0.55 + 0.45 * ease_out_back(lt / 0.24)
            al = clamp01(lt / 0.08)
            if rem < 0.1 and b < MAIN_T - 0.01:
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
    overlays(img, t, seg[0])
    chrome(img, t, seg)
    return img

_pola = {}
def draw_polaroid(frame, t, seg):
    lt = t - seg[0]
    if "bg" not in _pola:
        bg = crop_view(frame, 1250, 540, 1.0).filter(ImageFilter.GaussianBlur(20))
        _pola["bg"] = Image.blend(bg, Image.new("RGB", (W, H), (14, 26, 70)), 0.45)
        photo = frame.resize((900, 622), Image.LANCZOS, box=(560, 120, 1760, 950))
        card = Image.new("RGBA", (960, 840), (0, 0, 0, 0)); d = ImageDraw.Draw(card)
        d.rounded_rectangle([0, 0, 959, 839], radius=18, fill=(255, 254, 250, 255))
        card.paste(photo, (30, 30))
        card.alpha_composite(POLA_TEXT, ((960 - POLA_TEXT.width) // 2, 662))
        card.alpha_composite(POLA_DATE, (960 - POLA_DATE.width - 30, 760))
        _pola["card"] = with_shadow(card, 16, 20, 170)
    img = _pola["bg"].copy()
    s = 1.25 - 0.25 * ease_out_back(lt / 0.35)
    put(img, scaled(_pola["card"], s, rot=-4 + 2 * (1 - smooth(lt / 0.5))), 540, 960)
    cs = ease_out_back((lt - 0.15) / 0.3)
    if cs > 0:
        put(img, scaled(CLICK, max(0.05, cs), rot=10), 860, 560)
    if lt < 0.3:
        fl = Image.new("RGB", (W, H), (255, 255, 255))
        img = Image.blend(img, fl, 0.9 * (1 - lt / 0.3))
    chrome(img, t, seg)
    return img

def draw_split(frame, t, seg):
    lt = t - seg[0]
    img = Image.new("RGB", (W, H), (14, 26, 70))
    top = crop_view(frame, SPLIT_TOP[0], SPLIT_TOP[1], SH / (SPLIT_TOP[2] * 950 / 1080), W, 950)
    bot = crop_view(frame, SPLIT_BOT[0], SPLIT_BOT[1], SH / (SPLIT_BOT[2] * 970 / 1080), W, 970)
    k = ease_out(lt / 0.35)
    img.paste(top, (int(-W * (1 - k)), 0))
    img.paste(bot, (int(W * (1 - k)), 950))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 944, W, 956], fill=(255, 255, 255))
    la = ease_out_back((lt - 0.35) / 0.3)
    if la > 0:
        put(img, scaled(LABEL_TOP, max(0.05, la)), 330, 860)
    lb = ease_out_back((lt - 0.65) / 0.3)
    if lb > 0:
        put(img, scaled(LABEL_BOT, max(0.05, lb)), 360, 1040)
    overlays(img, t, seg[0])
    chrome(img, t, seg)
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
    vf = ("setpts=PTS/%d," % speed if speed > 1 else "") + "fps=30,hqdn3d=1.5:1.5:3:3,eq=saturation=1.1:contrast=1.04"
    cmd = ["ffmpeg", "-v", "fatal", "-ss", f"{start:.3f}", "-t", f"{dur * max(speed, 1) + 0.3:.3f}", "-i", SRC,
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
    def emit(i, make):
        if want is None:
            enc.stdin.write(make().tobytes())
        elif i in want:
            make().save(f"{OUT}/still_{want[i]:05.2f}.jpg", quality=88)
    i = 0
    last = None
    for seg in EDL:
        o0, o1, s0, speed, kind = seg[:5]
        n = int(round((o1 - o0) * FPS))
        if kind == "polaroid":
            fr = next(frames(s0, 0.1, 1))
            for j in range(n):
                t = (i) / FPS
                emit(i, lambda fr=fr, t=t, seg=seg: draw_polaroid(fr, t, seg)); i += 1
            continue
        draw = draw_split if kind == "split" else draw_crop
        j = 0
        for fr in frames(s0, o1 - o0, speed):
            if j >= n: break
            t = i / FPS
            need_last = (seg is EDL[-1] and j == n - 1)
            if need_last:
                last = draw(fr, t, seg);
                if want is None: enc.stdin.write(last.tobytes())
                elif i in want: last.save(f"{OUT}/still_{want[i]:05.2f}.jpg", quality=88)
            else:
                emit(i, lambda fr=fr, t=t, seg=seg, draw=draw: draw(fr, t, seg))
            i += 1; j += 1
        while j < n:                       # pad if the decoder came up short
            emit(i, lambda: last if last is not None else Image.new("RGB", (W, H))); i += 1; j += 1
    while i < TOTAL_N:
        emit(i, lambda t=i / FPS: draw_outro(last, t)); i += 1
    if enc:
        enc.stdin.close(); enc.wait()
    print("frames", i)

main()
