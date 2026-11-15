"""EP07 '출근한 8개월 신입사원' Short -- an upgraded format: an office-worker story told by an AI inner voice
(kid voice for 승유, a 'team leader' voice for dad), a floating monitor window that types along with every real
keystroke (gibberish for 승유, a proper red comment when dad's hand types), a work-day clock, messenger
notifications, drama-style subtitles, starburst beats and a '퇴근 보고' card. Edited from a 27 s vertical clip.

usage: render_ep07.py SCRATCH SRC.mp4 OUT.mp4|STILLS_DIR [--stills t1,t2,...]
"""
import json, math, random, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

S, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
STILLS = None
if "--stills" in sys.argv:
    STILLS = [float(v) for v in sys.argv[sys.argv.index("--stills") + 1].split(",")]

W, H, FPS = 1080, 1920, 30
SW, SH = 1080, 1920
FONT = "/usr/share/fonts/truetype/nanum/NanumSquareRoundEB.ttf"
PEN = "/usr/share/fonts/truetype/nanum/NanumPen.ttf"
MONO = "/usr/share/fonts/truetype/nanum/NanumGothicCodingBold.ttf"
EMOJI = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
NAVY = (20, 36, 96)
YELLOW = (255, 216, 77)
WHITE = (255, 255, 255)
CORAL = (255, 77, 109)
INK_DARK = (24, 28, 44)

# edit decision list: (out_start, out_end, src_start, speed, kind, camera keys [(out_t, cx, cy, z)])
EDL = [
    (0.0, 2.6, 11.0, 1, "crop", [(0.0, 400, 950, 1.42), (2.6, 395, 945, 1.6)]),
    (2.6, 6.6, 0.0, 1, "crop", [(2.6, 470, 900, 1.25), (6.6, 480, 900, 1.28)]),
    (6.6, 10.6, 5.0, 1, "crop", [(6.6, 470, 900, 1.25), (10.6, 480, 900, 1.25)]),
    (10.6, 12.2, 9.0, 1, "crop", [(10.6, 480, 900, 1.25), (12.2, 470, 900, 1.3)]),
    (12.2, 14.6, 13.6, 1, "crop", [(12.2, 430, 920, 1.35), (12.9, 400, 930, 1.75), (14.6, 400, 930, 1.8)]),
    (14.6, 17.6, 16.0, 1, "crop", [(14.6, 470, 920, 1.2), (15.6, 400, 1080, 1.15), (16.3, 320, 1180, 1.15), (17.0, 330, 1180, 1.2), (17.6, 380, 1080, 1.2)]),
    (17.6, 20.5, 19.0, 1, "crop", [(17.6, 400, 1000, 1.2), (20.5, 440, 950, 1.22)]),
    (20.5, 22.5, 21.9, 1, "crop", [(20.5, 440, 940, 1.22), (22.5, 430, 960, 1.25)]),
    (22.5, 25.85, 23.9, 1, "crop", [(22.5, 420, 980, 1.3), (24.0, 380, 1000, 1.5), (25.0, 390, 990, 1.45), (25.85, 420, 960, 1.3)]),
    (25.85, 28.85, 25.3, 0, "card", None),
]
MAIN_T = 28.85
OUTRO_T = MAIN_T
TOTAL_N = int(round((MAIN_T + 2.8) * FPS))

# AI voice lines: (start, end, speaker, text) -- subtitles follow these
LINES = [
    (0.35, 2.37, "승유", "아 왜요? 일하는 중인데요."),
    (3.0, 4.83, "승유", "자, 오늘도 열심히 일해볼까?"),
    (7.3, 9.58, "승유", "보고서는 원래 [감]으로 치는 거예요."),
    (11.0, 12.67, "팀장님", "승유 씨, 보고서 언제 돼요?"),
    (13.0, 14.13, "승유", "…못 본 걸로 할게요."),
    (15.75, 16.93, "팀장님", "이건 이렇게 하는 거예요."),
    (17.75, 20.52, "승유", "아, 팀장님… 제가 할게요."),
    (24.2, 26.67, "승유", "6시다! [칼퇴]하겠습니다!"),
]
# work-day clock: (from, label)
CLOCK = [(2.6, "09:00"), (6.6, "10:30"), (10.6, "11:45"), (14.6, "14:00"), (17.6, "16:30"), (20.5, "TL"), (21.3, "17:59"), (22.6, "18:00")]
TIMELAPSE = (20.5, 21.3)               # clock spins 16:30 -> 17:59
NOTIFS = [  # (in, out, app, sender, message, time)
    (10.8, 14.1, "💬 메신저", "팀장님 (아빠)", "승유 씨, 보고서 언제 돼요? 🙂", "11:45"),
    (22.6, 25.6, "🔔 알림", "인사팀", "18:00 퇴근 시간입니다. 오늘도 수고했어요!", "18:00"),
]
NAMETAG = (2.9, 6.2)
BURSTS = [(15.6, "등판?!", (830, 1010)), (24.2, "칼퇴!", (820, 1130))]
DAD_KEYS = (15.6, 17.6)                # keystrokes in this window are dad's: proper text
SEG_MAP = [(o0, s0) for o0, o1, s0, sp, k, _ in EDL if k == "crop"]


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



# ---------------------------------------------------------------- sprites
HOOK = [text_line("8개월 아기의", 100), text_line("[첫 출근] 💻", 120)]
HOOK_Y = (520, 680)

def title_pill():
    size = 62
    while True:
        t = text_line("출근한 [8개월] 신입사원 아기 💻", size, fill=NAVY, hl=(232, 74, 95), stroke=WHITE, sw=0)
        if t.width + 60 <= 1000 or size <= 44: break
        size -= 2
    w, h = t.width + 20, int(size * 2)
    im = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([20, 20, 20 + w, 20 + h], radius=h // 2, fill=(255, 255, 255, 240), outline=YELLOW, width=7)
    im.alpha_composite(t, ((im.width - t.width) // 2, (im.height - t.height) // 2 + 2))
    return with_shadow(im, 6, 8, 120), text_line("@아톰문 · 승유 성장일기", 38, sw=5)
TITLE, TITLE_TAG = title_pill()

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

# drama-style subtitle bar with a speaker chip
CHIP = {"승유": ((255, 216, 77), NAVY, "승유 🍼"), "팀장님": ((255, 77, 109), WHITE, "팀장님 👔")}
def subtitle(speaker, text):
    bg, fg, label = CHIP[speaker]
    chip = text_line(label, 34, fill=fg, stroke=bg, sw=0, shadow=False)
    t = text_line(text, 58, fill=WHITE, hl=YELLOW, stroke=(10, 14, 36), sw=6, shadow=False)
    while t.width > 980:
        t = text_line(text, int(58 * 980 / t.width), fill=WHITE, hl=YELLOW, stroke=(10, 14, 36), sw=6, shadow=False)
    w = max(t.width + 40, chip.width + 60); h = t.height + 46
    im = Image.new("RGBA", (w, h + 34), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 34, w - 1, 34 + h - 1], radius=30, fill=(14, 20, 52, 215))
    d.rounded_rectangle([24, 0, 24 + chip.width + 8, 58], radius=24, fill=bg + (255,))
    im.alpha_composite(chip, (28, 29 - chip.height // 2))
    im.alpha_composite(t, ((w - t.width) // 2, 34 + (h - t.height) // 2 + 6))
    return with_shadow(im, 6, 10, 130)
SUBS = [subtitle(sp, tx) for _, _, sp, tx in LINES]
SUB_Y = 1500

_clk = {}
def clock_img(label):
    if label not in _clk:
        t = text_line(f"⏰ {label}", 42, fill=WHITE, stroke=(10, 14, 36), sw=0, shadow=False)
        im = Image.new("RGBA", (t.width + 30, 84), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        d.rounded_rectangle([0, 0, im.width - 1, 83], radius=42, fill=(14, 20, 52, 220), outline=(120, 200, 255), width=4)
        im.alpha_composite(t, (15, (84 - t.height) // 2 + 2))
        _clk[label] = with_shadow(im, 5, 8, 120)
    return _clk[label]
FF_PILL = text_line("⏩ 몇 시간 후…", 60, fill=WHITE, sw=8)

def nametag():
    name = text_line("문승유", 76, fill=WHITE, stroke=(10, 14, 36), sw=0, shadow=False)
    sub = text_line("아톰컴퍼니 신입사원 · 8개월", 38, fill=(200, 225, 255), stroke=(10, 14, 36), sw=0, shadow=False)
    w = max(name.width, sub.width) + 70; h = name.height + sub.height + 10
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=22, fill=(14, 20, 52, 225))
    d.rectangle([0, 0, 16, h - 1], fill=YELLOW)
    im.alpha_composite(name, (40, 0)); im.alpha_composite(sub, (42, name.height - 6))
    return with_shadow(im, 6, 10, 130)
NAMETAG_IMG = nametag()

def notif_img(app, sender, msg, tm):
    w, h = 960, 168
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=34, fill=(250, 250, 252, 245))
    a = text_line(app, 30, fill=(120, 124, 140), stroke=WHITE, sw=0, shadow=False)
    s = text_line(sender, 40, fill=INK_DARK, stroke=WHITE, sw=0, shadow=False)
    m = text_line(msg, 40, fill=(60, 64, 84), stroke=WHITE, sw=0, shadow=False)
    tt = text_line(tm, 30, fill=(140, 144, 160), stroke=WHITE, sw=0, shadow=False)
    im.alpha_composite(a, (18, 0)); im.alpha_composite(tt, (w - tt.width - 14, 0))
    im.alpha_composite(s, (18, 40)); im.alpha_composite(m, (18, 92))
    return with_shadow(im, 8, 14, 150)
NOTIF_IMG = [notif_img(*n[2:]) for n in NOTIFS]

# ---- the floating monitor window: text grows with every real keystroke
KEYS = []
_on = json.load(open(f"{S}/ep07/onsets.json"))
for o0, o1, s0, sp, kind, _ in EDL:
    if kind != "crop": continue
    for t in _on:
        if s0 <= t < s0 + (o1 - o0):
            KEYS.append(o0 + (t - s0))
KEYS = sorted(k for k in KEYS if k >= 2.9)
_rng = random.Random(7)
JAMO = "ㅁㄴㅇㄹㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅗㅓㅏㅣㅠㅜㅡ;;ㅋ"
DAD_TEXT = "▶ 팀장 코멘트: 다시 써 오세요 ^^;"
_pieces = []; _dad_i = 0
for k in KEYS:
    if DAD_KEYS[0] <= k < DAD_KEYS[1]:
        n = 2 if _dad_i < len(DAD_TEXT) else 0
        _pieces.append(("dad", DAD_TEXT[_dad_i:_dad_i + n])); _dad_i += n
    else:
        _pieces.append(("baby", "".join(_rng.choice(JAMO) for _ in range(_rng.randint(2, 4)))))
MW, MH, MX, MY = 500, 330, 805, 585       # window size and centre
MONO_F = ImageFont.truetype(MONO, 27)
TITLE_F = ImageFont.truetype(MONO, 21)

def monitor_img(t):
    n = sum(1 for k in KEYS if k <= t)
    im = Image.new("RGBA", (MW, MH), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, MW - 1, MH - 1], radius=18, fill=(250, 251, 255, 245), outline=(40, 46, 80), width=3)
    d.rounded_rectangle([0, 0, MW - 1, 44], radius=18, fill=(40, 46, 80, 255)); d.rectangle([0, 26, MW - 1, 44], fill=(40, 46, 80, 255))
    for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse([16 + 26 * i, 14, 32 + 26 * i, 30], fill=c)
    d.text((100, 22), "보고서_최종_진짜최종.hwp", font=TITLE_F, fill=(220, 226, 255), anchor="lm")
    # text body: header + typed pieces, wrapped, last lines visible
    lines = [("hd", "[주간 업무 보고]"), ("hd", "작성: 문승유 (신입)"), ("txt", "")]
    for who, s in _pieces[:n]:
        tag = "dad" if who == "dad" else "txt"
        if lines[-1][0] != tag:
            lines.append((tag, ""))
        cur = lines[-1][1] + s
        while d.textlength(cur, font=MONO_F) > MW - 40:
            cut = len(cur) - 1
            while d.textlength(cur[:cut], font=MONO_F) > MW - 40: cut -= 1
            lines[-1] = (tag, cur[:cut]); lines.append((tag, "")); cur = cur[cut:]
        lines[-1] = (tag, cur)
    end_state = None
    if t >= 22.9:
        end_state = "save" if t < 24.4 else ("done" if t >= 25.0 else "yes")
    vis = lines[-7:] if end_state is None else lines[-4:]
    y = 62
    for tag, s in vis:
        col = {"hd": (60, 70, 120), "txt": (30, 30, 40), "dad": (220, 40, 60)}[tag]
        d.text((20, y), s, font=MONO_F, fill=col); y += 36
    if end_state is None and int(t * 2.4) % 2 == 0 and t >= 2.9:     # blinking caret
        lx = 20 + d.textlength(vis[-1][1], font=MONO_F)
        d.rectangle([lx + 2, y - 34, lx + 6, y - 6], fill=(30, 30, 40))
    if end_state:
        d.rounded_rectangle([40, 170, MW - 40, MH - 20], radius=16, fill=(40, 46, 80, 250))
        msg = "💾 저장하고 퇴근할까요?" if end_state != "done" else "✅ 퇴근 처리 완료!"
        mt = text_line(msg, 32, fill=WHITE, stroke=(40, 46, 80), sw=0, shadow=False)
        im.alpha_composite(mt, ((MW - mt.width) // 2, 180))
        if end_state != "done":
            on = end_state == "yes"
            d.rounded_rectangle([MW // 2 - 70, 248, MW // 2 + 70, 296], radius=14, fill=YELLOW if on else (90, 100, 150))
            d.text((MW // 2, 272), "예", font=ImageFont.truetype(FONT, 32), fill=NAVY if on else WHITE, anchor="mm")
    return with_shadow(im, 8, 12, 140)

rng = random.Random(17)
AMBIENT = []
_t = 0.5
while _t < MAIN_T:
    AMBIENT.append(dict(t0=_t, x=rng.uniform(70, 1010), v=rng.uniform(150, 260), s=rng.uniform(36, 54),
                        wob=rng.uniform(10, 26), fq=rng.uniform(0.8, 1.8), ph=rng.uniform(0, 6.28), e=rng.choice("✨⌨")))
    _t += rng.uniform(1.0, 1.8)
CONFETTI = [dict(x=rng.uniform(0, W), v=rng.uniform(380, 650), d=rng.uniform(0, 0.5), rot=rng.uniform(0, 360),
                 spin=rng.uniform(-400, 400), c=rng.choice([YELLOW, CORAL, (90, 200, 255), (130, 230, 150), WHITE]),
                 w=rng.randint(14, 24), h=rng.randint(22, 34)) for _ in range(70)]
CONF_T = 24.3
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

# '퇴근 보고' card pieces (computer-window look)
INK = (52, 58, 84)
CARD_HEAD = text_line("📋 오늘의 퇴근 보고", 60, fill=NAVY, stroke=WHITE, sw=0, shadow=False)
CARD_ROWS = [text_line(c, 54, fill=INK, stroke=WHITE, sw=0, path=PEN, shadow=False) for c in
             ["⏰ 근무: 09:00 ~ 18:00 (칼퇴)", "⌨️ 타자: 1,247타 (오타 1,246개)", "🍼 커피 대신: 우유 2병", "📝 보고서: 감으로 완성"]]
CARD_DATE = text_line("2026.11.15 · 승유 8개월", 40, fill=(140, 140, 160), stroke=WHITE, sw=0, path=PEN, shadow=False)

def stamp():
    t1 = text_line("칼퇴", 50, fill=CORAL, stroke=WHITE, sw=0, shadow=False)
    t2 = text_line("승인 👍", 58, fill=CORAL, stroke=WHITE, sw=0, shadow=False)
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


def overlays(img, t):
    for b in AMBIENT:
        dt = t - b["t0"]
        if dt < 0: continue
        y = 1980 - b["v"] * dt
        if y < 420: continue
        x = b["x"] + b["wob"] * math.sin(b["fq"] * 2 * math.pi * dt + b["ph"])
        a = min(1, dt / 0.4) * min(1, (y - 420) / 300) * 0.35
        put(img, scaled(emoji_img(b["e"], int(b["s"])), 1, a), x, y)
    for tb, label, (bx, by) in BURSTS:
        dt = t - tb
        if -0.02 <= dt <= 0.95:
            s = 0.25 + 0.75 * ease_out_back(dt / 0.22)
            s *= 1 + 0.04 * math.sin(dt * 28) * math.exp(-dt * 4)
            a = 1 - clamp01((dt - 0.75) / 0.2)
            put(img, scaled(BURST[label], s * 0.72, a, rot=-8 + 6 * math.sin(dt * 9)), bx, by)
    dt = t - CONF_T
    if dt >= 0:
        for c in CONFETTI:
            ct = dt - c["d"]
            if ct < 0: continue
            y = -40 + c["v"] * ct
            if y > H + 40: continue
            piece = Image.new("RGBA", (c["w"], c["h"]), c["c"] + (255,))
            put(img, piece.rotate(c["rot"] + c["spin"] * ct, expand=True), c["x"] + 30 * math.sin(ct * 4 + c["x"]), y)
    return img

def clock_label(t):
    lab = None
    for t0, l in CLOCK:
        if t >= t0: lab = l
    if lab == "TL":                     # time-lapse: digits race from 16:30 to 17:59
        k = smooth((t - TIMELAPSE[0]) / (TIMELAPSE[1] - TIMELAPSE[0]))
        m = int(16 * 60 + 30 + (89 * k))
        lab = f"{m // 60:02d}:{m % 60:02d}"
    return lab

def chrome(img, t, seg, captions=True):
    """Hook, title, work clock, name tag, monitor window, notifications and subtitles."""
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
    if 2.6 <= t < MAIN_T - 0.01 and captions:
        lab = clock_label(t)
        flip = max(math.exp(-((t - t0) / 0.08) ** 2) for t0, _ in CLOCK)
        a = clamp01((t - 2.6) / 0.25) * clamp01((25.85 - t) / 0.2)
        im = clock_img(lab)
        im = im.resize((im.width, max(1, int(im.height * (1 - 0.7 * flip)))), Image.BICUBIC) if flip > 0.05 else im
        put(img, scaled(im, 1 + 0.08 * (TIMELAPSE[0] <= t < TIMELAPSE[1]), a), 150, 470)
    if TIMELAPSE[0] - 0.1 <= t < TIMELAPSE[1] + 0.3:
        a = clamp01((t - TIMELAPSE[0] + 0.1) / 0.15) * clamp01((TIMELAPSE[1] + 0.3 - t) / 0.2)
        put(img, scaled(FF_PILL, 1 + 0.05 * math.sin(t * 20), a), 540, 1000)
    if captions and 2.9 <= t < 25.85:                    # monitor window
        s = ease_out_back((t - 2.9) / 0.35) if t < 3.3 else 1.0
        a = clamp01((25.85 - t) / 0.2)
        put(img, scaled(monitor_img(t), max(0.05, s), a), MX, MY)
    if captions and NAMETAG[0] <= t < NAMETAG[1]:
        k = ease_out((t - NAMETAG[0]) / 0.35) * (1 - smooth((t - NAMETAG[1] + 0.35) / 0.35))
        put(img, scaled(NAMETAG_IMG, 1, k), -NAMETAG_IMG.width / 2 + (NAMETAG_IMG.width + 30) * k, 1290)
    for (t0, t1, *_), im in zip(NOTIFS, NOTIF_IMG):
        if t0 <= t < t1 + 0.35:
            kin = ease_out_back((t - t0) / 0.35)
            y = -200 + (660 + 200) * kin
            x = 540
            if t >= t1:                                      # swiped away
                x = 540 - 1300 * ease_out((t - t1) / 0.35)
            put(img, im, x, y)
    if not captions:
        return
    for (t0, t1, sp, tx), im in zip(LINES, SUBS):
        if t0 - 0.05 <= t < t1 + 0.25:
            k = ease_out((t - t0 + 0.05) / 0.18)
            a = k * clamp01((t1 + 0.25 - t) / 0.15)
            put(img, scaled(im, 0.9 + 0.1 * k, a), 540, SUB_Y + 30 * (1 - k))

def draw_crop(frame, t, seg):
    cx, cy, z = keyed(seg[5], t)
    z *= burst_zoom(t)
    lt = t - seg[0]
    z *= 1 + 0.06 * (1 - ease_out(lt / 0.25)) if seg[0] > 0 else 1      # settle on every cut
    dx, dy = shake(t)
    img = crop_view(frame, cx + dx, cy + dy, z)
    if TIMELAPSE[0] <= t < TIMELAPSE[1]:                 # time-lapse: cool tint + slight blur streak
        img = Image.blend(img, img.filter(ImageFilter.BoxBlur(6)), 0.5)
        img = Image.blend(img, Image.new("RGB", (W, H), (40, 60, 140)), 0.18)
    overlays(img, t)
    chrome(img, t, seg)
    return img

_card = {}
def draw_card(frame, t, seg):
    """Freeze with the '퇴근 보고' window: rows tick in, then the stamp."""
    lt = t - seg[0]
    if "bg" not in _card:
        bg = crop_view(frame, 420, 960, 1.3).filter(ImageFilter.GaussianBlur(20))
        _card["bg"] = Image.blend(bg, Image.new("RGB", (W, H), (14, 26, 70)), 0.45)
        card = Image.new("RGBA", (940, 1040), (0, 0, 0, 0)); d = ImageDraw.Draw(card)
        d.rounded_rectangle([0, 0, 939, 1039], radius=26, fill=(252, 252, 255, 255), outline=(40, 46, 80), width=6)
        d.rounded_rectangle([0, 0, 939, 64], radius=26, fill=(40, 46, 80)); d.rectangle([0, 36, 939, 64], fill=(40, 46, 80))
        for i, c in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
            d.ellipse([24 + 34 * i, 20, 46 + 34 * i, 42], fill=c)
        d.text((150, 32), "퇴근보고서_승유.hwp", font=ImageFont.truetype(MONO, 28), fill=(220, 226, 255), anchor="lm")
        card.alpha_composite(CARD_HEAD, ((940 - CARD_HEAD.width) // 2, 78))
        photo = frame.resize((330, 400), Image.LANCZOS, box=(176, 795, 516, 1207))
        ph = Image.new("RGBA", (350, 420), WHITE); ph.paste(photo, (10, 10))
        card.alpha_composite(with_shadow(ph.rotate(-3, resample=Image.BICUBIC, expand=True), 6, 8, 110), (285, 158))
        for k in range(4):
            y = 696 + 70 * k
            d.line([(60, y), (880, y)], fill=(225, 228, 240), width=3)
        card.alpha_composite(CARD_DATE, (940 - CARD_DATE.width - 40, 975))
        _card["card"] = card
    img = _card["bg"].copy()
    card = _card["card"].copy()
    for k, row in enumerate(CARD_ROWS):
        rt = lt - 0.35 - 0.3 * k
        if rt > 0:
            s = 0.4 + 0.6 * ease_out_back(rt / 0.22)
            r = scaled(row, s)
            card.alpha_composite(r, (int(60 + row.width * (1 - s) / 2), int(628 + 70 * k + row.height * (1 - s) / 2)))
    st = lt - 1.75
    if st > 0:
        s = 2.2 - 1.2 * ease_out(st / 0.16)
        sp = scaled(STAMP, s, clamp01(st / 0.08), rot=-12)
        card.alpha_composite(sp, (int(780 - sp.width / 2), int(360 - sp.height / 2)))
    cs = 1.18 - 0.18 * ease_out_back(lt / 0.35)
    shake_y = 10 * math.exp(-max(0, st) / 0.08) * math.sin(st * 60) if st > 0 else 0
    put(img, scaled(with_shadow(card, 16, 20, 170), cs, rot=-2 + 2 * (1 - smooth(lt / 0.5))), 540, 1040 + shake_y)
    if lt < 0.25:
        img = Image.blend(img, Image.new("RGB", (W, H), (255, 255, 255)), 0.7 * (1 - lt / 0.25))
    chrome(img, t, seg, captions=False)
    # the last line of the voice still plays over the card's first moment
    for (t0, t1, sp, tx), im in zip(LINES, SUBS):
        if t0 <= t < t1 + 0.25:
            put(img, scaled(im, 1, clamp01((t1 + 0.25 - t) / 0.15)), 540, SUB_Y + 60)
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
            for j in range(n):
                if needed(i):
                    last = draw_card(fr, i / FPS, seg); emit(i, last)
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
