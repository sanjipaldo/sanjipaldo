# 입점 제안서 PDF용 한글 글꼴(DoogoSans) 만들기: Pretendard TTF(npm "pretendard" 패키지 dist/public/static/alternative)를
# KS X 1001 한글 2,350자 + 영문·숫자·기호로 줄이고 이름을 바꿉니다(SIL OFL Reserved Font Name). 사용: python3 scripts/make-proposal-font.py <TTF 폴더> <출력 폴더>
# 출력 TTF를 gzip+base64로 apps/server/services/proposal-font-data.ts에 넣습니다.
import sys, gzip, base64
from fontTools.ttLib import TTFont
from fontTools import subset

src_dir, out_dir = sys.argv[1], sys.argv[2]
cps = set(range(0x20, 0x7F)) | set(range(0xA0, 0x100))
hangul = []
for c in range(0xAC00, 0xD7A4):
    try:
        if len(chr(c).encode("euc_kr")) == 2: hangul.append(c)
    except UnicodeEncodeError:
        pass
cps |= set(hangul)
for a, b in [(0x2010, 0x2027), (0x2030, 0x203B), (0x2190, 0x2199), (0x2460, 0x2473), (0x25A0, 0x25CF), (0x3000, 0x3011), (0x3131, 0x318E)]:
    cps |= set(range(a, b + 1))
cps |= {0x20A9, 0x2103, 0x2605, 0x2606, 0x2713, 0x2714, 0x338F, 0x33A1, 0xFF5E, 0x2022, 0x00B7, 0x2122}
print("hangul", len(hangul), "total codepoints", len(cps))
for weight in ["Regular", "Bold"]:
    font = TTFont(f"{src_dir}/Pretendard-{weight}.ttf")
    opts = subset.Options()
    opts.layout_features = ["kern", "liga", "ccmp", "locl", "mark", "mkmk"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.hinting = False
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=cps)
    sub.subset(font)
    # OFL Reserved Font Name: 수정본(서브셋)은 다른 이름을 씁니다.
    for rec in font["name"].names:
        if rec.nameID in (1, 3, 4, 6, 16, 17):
            text = rec.toUnicode().replace("Pretendard", "DoogoSans")
            rec.string = text
    path = f"{out_dir}/DoogoSans-{weight}.ttf"
    font.save(path)
    raw = open(path, "rb").read()
    gz = gzip.compress(raw, 9)
    print(weight, "ttf", len(raw), "gzip", len(gz), "b64", len(base64.b64encode(gz)))
