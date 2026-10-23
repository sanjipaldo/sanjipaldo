"""Original cartoon 'baby astro' character of 승유 for the 아톰문 channel (SVG -> PNG).

usage: cartoon_icon.py OUT_DIR
Writes character.svg (transparent, for stickers), icon.svg and PNG renders.
"""
import math, random, subprocess, sys

OUT = sys.argv[1]
random.seed(5)
INK = "#1B2350"

def stars():
    out = []
    for _ in range(60):
        x, y = random.uniform(0, 800), random.uniform(0, 800)
        r = random.choice([1.6, 2.2, 2.8, 3.4])
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="#fff" opacity="{random.uniform(.5, 1):.2f}"/>')
    for x, y, r in [(120, 190, 24), (690, 600, 18), (150, 560, 13), (560, 95, 12), (710, 360, 10)]:
        pts = []
        for i in range(8):
            a = math.pi / 4 * i - math.pi / 2
            rr = r if i % 2 == 0 else r * 0.3
            pts.append(f"{x + rr * math.cos(a):.1f},{y + rr * math.sin(a):.1f}")
        out.append(f'<polygon points="{" ".join(pts)}" fill="#FFF3C4"/>')
    return "\n".join(out)

BACKGROUND = f"""
<defs>
  <radialGradient id="bg" cx="42%" cy="40%" r="75%">
    <stop offset="0" stop-color="#3A72E6"/><stop offset="1" stop-color="#0A1640"/>
  </radialGradient>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  <mask id="crescent"><rect width="800" height="800" fill="#fff"/><circle cx="560" cy="180" r="102" fill="#000"/></mask>
</defs>
<rect width="800" height="800" fill="url(#bg)"/>
{stars()}
<g mask="url(#crescent)">
  <circle cx="615" cy="205" r="112" fill="#FFD64D" filter="url(#glow)" opacity=".8"/>
  <circle cx="615" cy="205" r="112" fill="#FFD64D"/>
  <circle cx="660" cy="215" r="17" fill="#F0BE37"/><circle cx="640" cy="272" r="12" fill="#F0BE37"/>
</g>
<g fill="none" stroke="#86E6FF" stroke-width="10" opacity=".95">
  <ellipse cx="400" cy="400" rx="365" ry="105"/>
  <ellipse cx="400" cy="400" rx="365" ry="105" transform="rotate(60 400 400)"/>
  <ellipse cx="400" cy="400" rx="365" ry="105" transform="rotate(120 400 400)"/>
</g>
<g fill="#FF5A6E" stroke="#fff" stroke-width="6">
  <circle cx="58" cy="430" r="20"/><circle cx="252" cy="88" r="20"/><circle cx="676" cy="610" r="20"/>
</g>
"""

HELMET = ("M168 500 C140 330 222 172 400 168 C578 172 660 330 632 500 "
          "C610 512 596 470 580 440 C520 408 280 408 220 440 C204 470 190 512 168 500 Z")
CHARACTER = f"""
<g stroke="{INK}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">
  <!-- body / romper -->
  <path d="M150 820 C160 712 250 662 400 662 C550 662 640 712 650 820 Z" fill="#F6EEDF"/>
  <path d="M318 668 C340 712 460 712 482 668" fill="#FFFFFF"/>
  <!-- chest emblem: tiny atom -->
  <circle cx="400" cy="752" r="40" fill="#FFD64D"/>
  <g fill="none" stroke="#2A5BD7" stroke-width="5">
    <ellipse cx="400" cy="752" rx="27" ry="10"/>
    <ellipse cx="400" cy="752" rx="27" ry="10" transform="rotate(60 400 752)"/>
    <ellipse cx="400" cy="752" rx="27" ry="10" transform="rotate(120 400 752)"/>
  </g>
  <circle cx="400" cy="752" r="5" fill="#FF5A6E" stroke="none"/>
  <!-- chubby fists -->
  <circle cx="262" cy="735" r="44" fill="#FFD8C4"/>
  <path d="M240 712 Q252 702 262 712 M262 712 Q274 702 284 712" fill="none" stroke-width="6"/>
  <circle cx="538" cy="735" r="44" fill="#FFD8C4"/>
  <path d="M516 712 Q528 702 538 712 M538 712 Q550 702 560 712" fill="none" stroke-width="6"/>
  <!-- face: wide chubby cheeks -->
  <path d="M206 420 C186 540 250 664 400 664 C550 664 614 540 594 420 Z" fill="#FFDCC8"/>
  <!-- cheeks -->
  <ellipse cx="282" cy="560" rx="44" ry="28" fill="#FF9DAA" stroke="none" opacity=".75"/>
  <ellipse cx="518" cy="560" rx="44" ry="28" fill="#FF9DAA" stroke="none" opacity=".75"/>
  <!-- happy laughing eyes -->
  <path d="M292 482 Q324 446 356 482" fill="none" stroke-width="12"/>
  <path d="M444 482 Q476 446 508 482" fill="none" stroke-width="12"/>
  <!-- nose -->
  <path d="M388 518 Q400 528 412 518" fill="none" stroke="#C97C6B" stroke-width="7"/>
  <!-- big open laugh -->
  <path d="M338 548 Q400 562 462 548 Q458 628 400 630 Q342 628 338 548 Z" fill="#8E2B3F" stroke-width="9"/>
  <path d="M362 606 Q400 582 438 606 Q420 626 400 627 Q380 626 362 606 Z" fill="#FF7E90" stroke="none"/>
  <!-- helmet (cranial band, open on top) -->
  <path d="{HELMET}" fill="#FAFAF6" stroke="none"/>
  <g clip-path="url(#helm)" stroke="none">
    <path d="M540 170 C640 250 680 380 650 520 L560 520 C600 400 600 280 520 180 Z" fill="#DCE3EE"/>
    <path d="M150 520 C150 470 170 450 210 440 C200 470 192 500 180 520 Z" fill="#DCE3EE"/>
  </g>
  <path d="M236 262 C262 226 304 206 348 200" fill="none" stroke="#FFFFFF" stroke-width="16" opacity=".95"/>
  <path d="{HELMET}" fill="none"/>
  <!-- hair peeking out of the top opening -->
  <ellipse cx="400" cy="200" rx="84" ry="20" fill="#2B2A36" stroke-width="8"/>
  <path d="M324 204 C316 172 348 156 372 168 C382 144 420 144 430 168 C454 156 486 172 476 204 Z" fill="#2B2A36" stroke="none"/>
  <path d="M324 204 C316 172 348 156 372 168 C382 144 420 144 430 168 C454 156 486 172 476 204" fill="none" stroke-width="8"/>
  <g fill="none" stroke="#2B2A36" stroke-width="9"><path d="M384 152 Q376 130 388 114"/><path d="M402 148 Q404 124 420 112"/><path d="M418 154 Q432 138 448 136"/></g>
  <path d="M356 186 C366 176 380 174 392 180" fill="none" stroke="#5A5A70" stroke-width="5"/>
  <!-- vent holes -->
  <g fill="#3A3F55" stroke="none">
    <circle cx="232" cy="330" r="10"/><circle cx="214" cy="390" r="9"/><circle cx="270" cy="270" r="9"/>
  </g>
  <!-- blue heart -->
  <path d="M400 372 C380 352 368 338 378 326 C386 316 398 322 400 330 C402 322 414 316 422 326 C432 338 420 352 400 372 Z"
        fill="#3D8BFF" stroke="none"/>
  <!-- side badge -->
  <g transform="rotate(12 548 330)">
    <rect x="510" y="296" width="78" height="70" rx="16" fill="#FFFFFF"/>
    <path d="M510 320 L510 312 Q510 296 526 296 L572 296 Q588 296 588 312 L588 320 Z" fill="#2A5BD7" stroke="none"/>
    <path d="M510 342 L588 342 L588 350 Q588 366 572 366 L526 366 Q510 366 510 350 Z" fill="#E8344B" stroke="none"/>
    <rect x="510" y="296" width="78" height="70" rx="16" fill="none" stroke-width="7"/>
    <circle cx="549" cy="331" r="11" fill="#FFFFFF" stroke-width="5"/>
  </g>
</g>
"""

def svg(body, bg=True):
    clip = f'<defs><clipPath id="helm"><path d="{HELMET}"/></clipPath></defs>'
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">{clip}{BACKGROUND if bg else ""}{body}</svg>'

def text_badge():
    return f"""
<g>
  <rect x="236" y="640" width="328" height="112" rx="56" fill="#FFD64D" stroke="#fff" stroke-width="10"/>
  <text x="400" y="723" font-family="NanumSquareRound" font-weight="800" font-size="84" fill="#14245F"
        text-anchor="middle">아톰문</text>
</g>"""

open(f"{OUT}/cartoon_icon.svg", "w").write(svg(CHARACTER))
open(f"{OUT}/cartoon_icon_text.svg", "w").write(svg(CHARACTER + text_badge()))
open(f"{OUT}/character.svg", "w").write(svg(CHARACTER, bg=False))
for name in ["cartoon_icon", "cartoon_icon_text", "character"]:
    subprocess.run(["rsvg-convert", "-w", "1600", "-h", "1600", "-o", f"{OUT}/{name}_1600.png", f"{OUT}/{name}.svg"], check=True)
for name, out in [("cartoon_icon", "atommoon_cartoon_icon_800"), ("cartoon_icon_text", "atommoon_cartoon_icon_text_800")]:
    subprocess.run(["rsvg-convert", "-w", "800", "-h", "800", "-o", f"{OUT}/{out}.png", f"{OUT}/{name}.svg"], check=True)
print("ok")
