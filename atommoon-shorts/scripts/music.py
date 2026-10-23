"""Original (self-composed) BGM + SFX on the episode's output timeline. 120 BPM, C major, ukulele/glockenspiel.

usage: music.py EPISODE.json OUT.wav
The music steps almost completely out of the way wherever the baby's voice is the point:
heavily ducked under each "음~" in the main clip and silent during the replay.
"""
import os, sys, wave
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy.signal import butter, sosfilt
from episode import Episode

EP = Episode(sys.argv[1]); OUT = sys.argv[2]
SR = 48000
BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT
N = int(EP.total * SR) + SR
rng = np.random.default_rng(3)
VOICES = [(a, b) for a, b, _ in EP["voices"]]

def note_hz(name):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    n, o = name[:-1], int(name[-1])
    return 440 * 2 ** ((names[n] + 12 * (o + 1) - 69) / 12)

def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    e = np.exp(-t / d)
    na = max(1, int(a * SR)); e[:na] *= np.linspace(0, 1, na)
    return e

def pluck(f, dur):
    n = int(dur * SR); p = int(SR / f)
    buf = sosfilt(butter(1, min(0.99, 2 * f * 5 / SR), output='sos'), rng.uniform(-1, 1, p))
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out * env(n, 0.002, 0.9)

_pc = {}
def pluck_c(f, dur):
    k = (round(f, 2), dur)
    if k not in _pc: _pc[k] = pluck(f, dur)
    return _pc[k]

def glock(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.15)
         + 0.15 * np.sin(2 * np.pi * f * 5.40 * t) * np.exp(-t / 0.06))
    return s * env(n, 0.002, 0.55)

def bass(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    e = env(n, 0.01, 0.6); rel = min(n, int(0.04 * SR)); e[-rel:] *= np.linspace(1, 0, rel)
    return s * e

def kick():
    n = int(0.25 * SR); t = np.arange(n) / SR
    f = 50 + 90 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.09)

def hat(dec=0.03):
    n = int(0.12 * SR)
    return sosfilt(butter(4, 7000, 'hp', fs=SR, output='sos'), rng.uniform(-1, 1, n)) * env(n, 0.001, dec)

def snap():
    n = int(0.2 * SR)
    return sosfilt(butter(2, [1200, 4000], 'bp', fs=SR, output='sos'), rng.uniform(-1, 1, n)) * env(n, 0.001, 0.05)

class Track:
    def __init__(self): self.L = np.zeros(N); self.R = np.zeros(N)
    def add(self, t, sig, gain=1.0, pan=0.0):
        i = int(t * SR); j = min(N, i + len(sig))
        if i >= N or i < 0: return
        self.L[i:j] += sig[:j - i] * gain * np.sqrt(0.5 * (1 - pan))
        self.R[i:j] += sig[:j - i] * gain * np.sqrt(0.5 * (1 + pan))

def near_voice(t, pad=0.35):
    return any(a - pad <= t <= b + pad for a, b in VOICES)

CHORDS = {'C': ['C4', 'E4', 'G4', 'C5'], 'Am': ['A3', 'C4', 'E4', 'A4'], 'F': ['F3', 'A3', 'C4', 'F4'], 'G': ['G3', 'B3', 'D4', 'G4']}
ROOT = {'C': 'C2', 'Am': 'A1', 'F': 'F2', 'G': 'G2'}
PROG = ['C', 'Am', 'F', 'G']
PHRASE_A = [
    [(0, 'E5', .5), (.5, 'G5', .5), (1, 'A5', .5), (1.5, 'G5', .5), (2, 'E5', 1), (3, 'C5', .5), (3.5, 'D5', .5)],
    [(0, 'E5', .5), (.5, 'E5', .5), (1, 'D5', .5), (1.5, 'C5', .5), (2, 'A4', 1.5)],
    [(0, 'F5', .5), (.5, 'A5', .5), (1, 'C6', .5), (1.5, 'A5', .5), (2, 'G5', 1), (3, 'F5', .5), (3.5, 'E5', .5)],
    [(0, 'D5', .5), (.5, 'E5', .5), (1, 'G5', 1), (2, 'B4', .5), (2.5, 'D5', .5), (3, 'G5', 1)]]
PHRASE_B = [
    [(0, 'G5', .5), (.5, 'E5', .5), (1, 'G5', .5), (1.5, 'C6', .5), (2, 'D6', .5), (2.5, 'C6', .5), (3, 'G5', 1)],
    [(0, 'A5', .5), (.5, 'G5', .5), (1, 'E5', .5), (1.5, 'D5', .5), (2, 'C5', .5), (2.5, 'D5', .5), (3, 'E5', 1)],
    [(0, 'F5', .5), (.5, 'E5', .5), (1, 'F5', .5), (1.5, 'A5', .5), (2, 'C6', 1), (3, 'A5', 1)],
    [(0, 'G5', .5), (.5, 'A5', .5), (1, 'B5', .5), (1.5, 'D6', .5), (2, 'G5', 1), (3, 'G5', .5), (3.5, 'G5', .5)]]

def strum(tr, t, ch, gain, up=False):
    notes = CHORDS[ch][::-1] if up else CHORDS[ch]
    for k, nm in enumerate(notes):
        tr.add(t + k * 0.011, pluck_c(note_hz(nm), 1.2), 0.22 * gain, pan=-0.35)

# ---- main clip music
main = Track()
nbars = int(np.ceil(EP.main_end / BAR))
for b in range(nbars):
    t0 = b * BAR; ch = PROG[b % 4]; full = b >= 2
    for pos, g, up in [(0, 1.0, False), (1.5, 0.75, True), (2.5, 0.8, False), (3.0, 0.6, True), (3.5, 0.7, False)]:
        if not full and pos not in (0, 2.5): continue
        strum(main, t0 + pos * BEAT, ch, g, up)
    if full:
        for pos in (0, 2):
            main.add(t0 + pos * BEAT, bass(note_hz(ROOT[ch]) * 2, BEAT * 1.8), 0.32)
        main.add(t0 + 3.5 * BEAT, bass(note_hz(ROOT[ch]) * 3, BEAT * 0.45), 0.2)
        for pos in (0, 2.5):
            main.add(t0 + pos * BEAT, kick(), 0.5)
        for pos in (1, 3):
            main.add(t0 + pos * BEAT, snap(), 0.35, pan=0.15)
        for e in range(8):
            main.add(t0 + e * BEAT / 2, hat(0.025 if e % 2 else 0.04), 0.10 if e % 2 else 0.16, pan=0.4)
    if b < 2:
        for i, nm in enumerate([CHORDS[ch][i] for i in (0, 1, 2, 3, 2, 1)]):
            tn = t0 + i * BEAT * 0.5 + BEAT
            if not near_voice(tn):
                main.add(tn, glock(note_hz(nm) * 2, 0.8), 0.12, pan=0.3)
    else:
        phrase = PHRASE_A if (b // 4) % 2 == 0 else PHRASE_B
        for pos, nm, d in phrase[b % 4]:
            tn = t0 + pos * BEAT
            if not near_voice(tn):                 # never put a melody note on top of the baby's voice
                main.add(tn, glock(note_hz(nm), d * BEAT + 0.6), 0.20, pan=0.3)
t = np.arange(N) / SR
duck = np.ones(N)
for a, b in VOICES:                                  # ~ -24 dB under every "음~"
    k = np.clip(np.minimum((t - a + 0.3) / 0.25, (b + 0.45 - t) / 0.3), 0, 1)
    duck = np.minimum(duck, 1 - 0.94 * k)
fade = np.clip(t / 0.05, 0, 1) * np.clip((EP.main_end - t) / 0.3, 0, 1)
main.L *= duck * fade; main.R *= duck * fade

# ---- diary + subscribe music (gentle, no drums)
outro = Track()
d0 = EP.diary[0]
for k, ch in enumerate(['F', 'G', 'Am', 'G']):
    tb = d0 + k * BAR * 0.75
    strum(outro, tb, ch, 0.9); strum(outro, tb + 1.5 * BEAT, ch, 0.55, True)
    outro.add(tb, bass(note_hz(ROOT[ch]) * 2, BAR * 0.7), 0.25)
mel = [(0, 'A5'), (.5, 'C6'), (1, 'F5'), (1.5, 'A5'), (2.25, 'B5'), (2.75, 'D6'), (3.25, 'G5'),
       (4.5, 'C6'), (5.0, 'E6'), (5.5, 'A5'), (6.75, 'B5'), (7.25, 'D6'), (7.75, 'G6')]
for pos, nm in mel:
    outro.add(d0 + pos * BEAT, glock(note_hz(nm), 0.9), 0.13, pan=0.3)
tE = EP.subscribe[0] + 0.8
for k, nm in enumerate(CHORDS['C'] + ['E5', 'G5']):
    outro.add(tE + k * 0.02, pluck(note_hz(nm), 2.4), 0.24, pan=-0.35)
outro.add(tE, bass(note_hz('C2') * 2, 2.0), 0.3)
for i, nm in enumerate(['C6', 'E6', 'G6', 'C7']):
    outro.add(tE + 0.1 + i * 0.09, glock(note_hz(nm), 1.6), 0.12, pan=0.3)
ofade = np.clip((t - d0 + 0.05) / 0.4, 0, 1) * np.clip((EP.total - t) / 0.8, 0, 1)
outro.L *= ofade; outro.R *= ofade

# ---- SFX
sfx = Track()
def pop():
    n = int(0.18 * SR); tt = np.arange(n) / SR
    f = 380 + 900 * np.exp(-tt / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.06)
def blub(f0):
    n = int(0.12 * SR); tt = np.arange(n) / SR
    f = f0 * (1 + 1.6 * tt / 0.12)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * tt / 0.12) ** 2
def bubbles(t0, count=7):
    for i in range(count):
        sfx.add(t0 + i * 0.045 + rng.uniform(0, 0.03), blub(rng.uniform(500, 1100)), 0.22, pan=rng.uniform(-0.6, 0.6))
def boing():
    n = int(0.45 * SR); tt = np.arange(n) / SR
    f = 220 + 160 * np.sin(2 * np.pi * 9 * tt) * np.exp(-tt / 0.18) + 120 * tt
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.003, 0.18)
def whoosh(dur=0.45):
    n = int(dur * SR); x = rng.uniform(-1, 1, n); out = np.zeros(n)
    for i in range(0, n, 512):
        fc = 400 + 5000 * i / n
        out[i:i + 512] = sosfilt(butter(2, [fc * 0.6, min(fc * 1.6, 20000)], 'bp', fs=SR, output='sos'), x[i:i + 512])
    return out * np.sin(np.pi * np.arange(n) / n) ** 1.5
def rewind(dur):
    """Tape-rewind chatter: fast descending chirps over hiss."""
    n = int(dur * SR); out = np.zeros(n)
    k = 0
    while k * 0.028 < dur - 0.02:
        tt = np.arange(int(0.024 * SR)) / SR
        f0 = 2400 - 1500 * (k * 0.028 / dur)
        ch = np.sin(2 * np.pi * np.cumsum(f0 * (1 - 0.5 * tt / 0.024)) / SR) * np.hanning(len(tt))
        i = int(k * 0.028 * SR); out[i:i + len(ch)] += ch[:n - i]
        k += 1
    hiss = sosfilt(butter(2, [2000, 9000], 'bp', fs=SR, output='sos'), rng.uniform(-1, 1, n))
    return (0.5 * out + 0.35 * hiss) * np.sin(np.pi * np.arange(n) / n) ** 0.5
def scribble(dur=0.4):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = sosfilt(butter(2, [1800, 6000], 'bp', fs=SR, output='sos'), rng.uniform(-1, 1, n))
    am = 0.5 + 0.5 * np.abs(np.sin(2 * np.pi * 11 * tt + 3 * np.sin(2 * np.pi * 3 * tt)))
    return s * am * np.sin(np.pi * tt / dur) ** 0.6
def thump():
    n = int(0.3 * SR); tt = np.arange(n) / SR
    body = np.sin(2 * np.pi * np.cumsum(70 + 80 * np.exp(-tt / 0.02)) / SR) * env(n, 0.001, 0.07)
    slap = sosfilt(butter(2, [600, 3000], 'bp', fs=SR, output='sos'), rng.uniform(-1, 1, n)) * env(n, 0.0005, 0.02)
    return body + 0.6 * slap
def ding(f):
    return glock(f, 1.0)
def click():
    n = int(0.05 * SR)
    return sosfilt(butter(2, 2500, 'hp', fs=SR, output='sos'), rng.uniform(-1, 1, n)) * env(n, 0.0005, 0.008)

for i, nm in enumerate(['G5', 'C6', 'E6']):
    sfx.add(0.05 + i * 0.07, ding(note_hz(nm)), 0.16)
sfx.add(1.85, whoosh(0.4), 0.18)
for tb in EP["bites"]:
    sfx.add(tb, pop(), 0.42); bubbles(tb + 0.05)
for tl in EP["lifts"]:
    if not near_voice(tl, 0.5):
        sfx.add(tl, boing(), 0.17)
for i, nm in enumerate(['C6', 'E6', 'G6', 'C7', 'E7']):
    sfx.add(EP["success"] + 0.05 + i * 0.07, ding(note_hz(nm)), 0.12, pan=-0.5 + i * 0.25)
sfx.add(EP.main_end, rewind(EP.replay[0][0] - EP.main_end), 0.30)
for j in range(len(EP["diary"])):
    sfx.add(d0 + 0.55 + 0.45 * j, scribble(0.4), 0.10, pan=-0.2 + 0.2 * j)
sfx.add(d0 + 2.05, thump(), 0.55)
s0 = EP.subscribe[0]
sfx.add(s0 - 0.05, whoosh(0.45), 0.18)
sfx.add(s0 + 1.3, click(), 0.6); sfx.add(s0 + 1.3, pop(), 0.25)

L = main.L + outro.L + sfx.L; R = main.R + outro.R + sfx.R
hp = butter(2, 45, 'hp', fs=SR, output='sos'); L = sosfilt(hp, L); R = sosfilt(hp, R)
x = np.stack([L, R], 1)[:int(EP.total * SR)]
x = x / (np.abs(x).max() + 1e-9) * 0.6
with wave.open(OUT, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
print("ok", x.shape[0] / SR, "s")
