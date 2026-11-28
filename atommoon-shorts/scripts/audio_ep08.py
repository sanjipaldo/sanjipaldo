"""EP08 audio (EP01 style): the EP01 ukulele/glockenspiel BGM under the clip's own sound, dipped for his real happy
squeals, a level-up jingle with the 'LEVEL UP', a comedic 털썩 thump + boing (the stand timer stops: a record ding),
bubbly fish pops for the EP01 mat, growth-card dings + the seal, and the EP01 ending.

usage: audio_ep08.py SRC.mp4 OUT_RAW.wav
"""
import subprocess, sys, wave
import numpy as np
from scipy.signal import butter, sosfilt

SRC, OUT = sys.argv[1], sys.argv[2]
SR = 48000
MAIN_T, TOTAL = 17.9, 20.7
N = int(TOTAL * SR)
BPM = 120; BEAT = 60 / BPM; BAR = 4 * BEAT
rng = np.random.default_rng(9)
LEVELUP, SIT, CARD = 6.5, 13.25, 15.3
EDL = [(0.0, 2.0, 4.5, 1), (2.0, 5.0, 0.0, 1), (5.0, 8.5, 3.0, 1), (8.5, 12.5, 7.0, 2), (12.5, 15.3, 15.0, 1)]
SQUEALS = [(3.05, 3.5), (5.1, 5.35), (6.25, 6.6)]   # his happy voice, clip time

def note_hz(name):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    return 440 * 2 ** ((names[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)

def env(n, a=0.005, d=0.3):
    t = np.arange(n) / SR
    e = np.exp(-t / d); na = max(1, int(a * SR)); e[:na] *= np.linspace(0, 1, na)
    return e

def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'bp', fs=SR, output='sos'), x)

def pluck(f, dur):
    n = int(dur * SR); p = int(SR / f)
    buf = sosfilt(butter(1, min(0.99, 2 * f * 5 / SR), output='sos'), rng.uniform(-1, 1, p)); out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]; buf[i % p] = 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return out * env(n, 0.002, 0.9)
_pc = {}
def pluck_c(f, dur):
    k = (round(f, 2), dur)
    if k not in _pc: _pc[k] = pluck(f, dur)
    return _pc[k]

def glock(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.15)
            + 0.15 * np.sin(2 * np.pi * f * 5.40 * t) * np.exp(-t / 0.06)) * env(n, 0.002, 0.55)

def bass(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    e = env(n, 0.01, 0.6); rel = min(n, int(0.04 * SR)); e[-rel:] *= np.linspace(1, 0, rel)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * e

def kick():
    n = int(0.25 * SR); t = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(50 + 90 * np.exp(-t / 0.03)) / SR) * env(n, 0.001, 0.09)

def hat(dec=0.03):
    n = int(0.12 * SR)
    return sosfilt(butter(4, 7000, 'hp', fs=SR, output='sos'), rng.uniform(-1, 1, n)) * env(n, 0.001, dec)

def snap():
    n = int(0.2 * SR)
    return bp(rng.uniform(-1, 1, n), 1200, 4000) * env(n, 0.001, 0.05)

class Track:
    def __init__(self): self.L = np.zeros(N); self.R = np.zeros(N)
    def add(self, t, sig, gain=1.0, pan=0.0):
        i = int(t * SR); j = min(N, i + len(sig))
        if i < 0 or i >= N: return
        self.L[i:j] += sig[:j - i] * gain * np.sqrt(0.5 * (1 - pan))
        self.R[i:j] += sig[:j - i] * gain * np.sqrt(0.5 * (1 + pan))

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

mus = Track()
for b in range(int(np.ceil(MAIN_T / BAR))):
    t0 = b * BAR; ch = PROG[b % 4]; full = b >= 1
    for pos, g, up in [(0, 1.0, False), (1.5, 0.75, True), (2.5, 0.8, False), (3.0, 0.6, True), (3.5, 0.7, False)]:
        if not full and pos not in (0, 2.5): continue
        notes = CHORDS[ch][::-1] if up else CHORDS[ch]
        for k, nm in enumerate(notes):
            mus.add(t0 + pos * BEAT + k * 0.011, pluck_c(note_hz(nm), 1.2), 0.22 * g, pan=-0.35)
    if full:
        for pos in (0, 2):
            mus.add(t0 + pos * BEAT, bass(note_hz(ROOT[ch]) * 2, BEAT * 1.8), 0.32)
        for pos in (0, 2.5):
            mus.add(t0 + pos * BEAT, kick(), 0.5)
        for pos in (1, 3):
            mus.add(t0 + pos * BEAT, snap(), 0.35, pan=0.15)
        for e in range(8):
            mus.add(t0 + e * BEAT / 2, hat(0.025 if e % 2 else 0.04), 0.10 if e % 2 else 0.16, pan=0.4)
    phrase = PHRASE_A if (b // 4) % 2 == 0 else PHRASE_B
    for pos, nm, d in phrase[b % 4]:
        mus.add(t0 + pos * BEAT, glock(note_hz(nm), d * BEAT + 0.6), 0.20 if full else 0.12, pan=0.3)



t = np.arange(N) / SR
g = np.ones(N)
for o0, o1, s0, sp in EDL:              # dip under his real squeals wherever they land in the edit
    if sp != 1: continue
    for a0, a1 in SQUEALS:
        if s0 <= a0 < s0 + (o1 - o0):
            q0, q1 = o0 + a0 - s0, o0 + a1 - s0
            k = np.clip(np.minimum((t - q0 + 0.1) / 0.1, (q1 + 0.15 - t) / 0.15), 0, 1)
            g = np.minimum(g, 1 - 0.6 * k)
k = np.clip(np.minimum((t - SIT + 0.02) / 0.02, (SIT + 0.6 - t) / 0.2), 0, 1)
g = np.minimum(g, 1 - 0.8 * k)          # a beat of silence on the 털썩
g *= np.clip(t / 0.05, 0, 1) * np.clip((MAIN_T - t) / 0.3, 0, 1)
mus.L *= g; mus.R *= g

end = Track()
for k_, nm in enumerate(CHORDS['C'] + ['E5', 'G5']):
    end.add(MAIN_T + k_ * 0.02, pluck(note_hz(nm), 2.4), 0.24, pan=-0.35)
end.add(MAIN_T, bass(note_hz('C2') * 2, 2.0), 0.35)
end.add(MAIN_T, kick(), 0.6)
for i, nm in enumerate(['C6', 'E6', 'G6', 'C7']):
    end.add(MAIN_T + 0.1 + i * 0.09, glock(note_hz(nm), 1.6), 0.13, pan=0.3)




sfx = Track()
def pop():
    n = int(0.18 * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(380 + 900 * np.exp(-tt / 0.03)) / SR) * env(n, 0.001, 0.06)
def whoosh(dur=0.4, up=True):
    n = int(dur * SR); x = rng.uniform(-1, 1, n); out = np.zeros(n)
    for i in range(0, n, 512):
        fr = i / n if up else 1 - i / n
        fc = 400 + 5000 * fr
        out[i:i + 512] = bp(x[i:i + 512], fc * 0.6, min(fc * 1.6, 20000))
    return out * np.sin(np.pi * np.arange(n) / n) ** 1.5
def click():
    n = int(0.05 * SR)
    return sosfilt(butter(2, 2500, 'hp', fs=SR, output='sos'), rng.uniform(-1, 1, n)) * env(n, 0.0005, 0.008)


def blip(f=1800):
    n = int(0.07 * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(f + 900 * tt / 0.07) / SR) * env(n, 0.001, 0.025)
def thump():
    n = int(0.3 * SR); tt = np.arange(n) / SR
    low = np.sin(2 * np.pi * np.cumsum(70 + 110 * np.exp(-tt / 0.02)) / SR) * env(n, 0.001, 0.09)
    hit = bp(rng.uniform(-1, 1, n), 200, 2500) * env(n, 0.0005, 0.02)
    return low + 0.5 * hit




def brass(f, dur):
    """Simple bright 'fanfare' tone: a few saw-ish harmonics with a soft attack."""
    n = int(dur * SR); tt = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * f * h * tt) / h for h in range(1, 7))
    e = np.minimum(1, tt / 0.03) * np.exp(-tt / (dur * 0.8)); rel = min(n, int(0.05 * SR)); e[-rel:] *= np.linspace(1, 0, rel)
    return sosfilt(butter(2, 5000, 'lp', fs=SR, output='sos'), s * e)

def square(f, dur):
    n = int(dur * SR); tt = np.arange(n) / SR
    return np.sign(np.sin(2 * np.pi * f * tt)) * env(n, 0.002, dur * 0.6) * 0.5
def boing():
    n = int(0.55 * SR); tt = np.arange(n) / SR
    f = 180 + 160 * np.sin(2 * np.pi * 10 * tt) * np.exp(-tt / 0.2) + 120 * tt
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.003, 0.22)
def bubble(f0=500):
    n = int(0.12 * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(f0 + 1600 * tt / 0.12) / SR) * env(n, 0.002, 0.04)

for i, nm in enumerate(['G5', 'C6', 'E6']):
    sfx.add(0.05 + i * 0.07, glock(note_hz(nm), 1.0), 0.13)
sfx.add(1.85, whoosh(0.4), 0.18)
for tc in (5.0, 8.5, 12.5):
    sfx.add(tc - 0.12, whoosh(0.28), 0.09)
sfx.add(LEVELUP, pop(), 0.26)                                       # level-up: 8-bit arpeggio + glock
for i, nm in enumerate(['C5', 'E5', 'G5', 'C6', 'E6', 'G6']):
    sfx.add(LEVELUP + 0.04 + i * 0.06, square(note_hz(nm), 0.12), 0.05, pan=-0.2)
for i, nm in enumerate(['C6', 'E6', 'G6', 'C7']):
    sfx.add(LEVELUP + 0.4 + i * 0.07, glock(note_hz(nm), 1.0), 0.1, pan=0.3)
sfx.add(SIT, thump(), 0.5); sfx.add(SIT + 0.08, boing(), 0.18)    # 털썩
sfx.add(SIT + 0.15, glock(note_hz('G6'), 0.9), 0.1); sfx.add(SIT + 0.25, glock(note_hz('C7'), 0.9), 0.1)   # 신기록 ding
for i in range(6):                                                  # fish mat bubbles
    sfx.add(SIT + 1.2 + i * 0.12, bubble(450 + 90 * i), 0.08, pan=-0.4 + 0.16 * i)
sfx.add(CARD - 0.15, whoosh(0.35), 0.14)
for k_, nm in enumerate(['E6', 'G6', 'C7', 'E7']):
    sfx.add(CARD + 0.35 + 0.3 * k_, glock(note_hz(nm), 0.8), 0.11)
sfx.add(CARD + 1.75, thump(), 0.55); sfx.add(CARD + 1.75, pop(), 0.15)
sfx.add(MAIN_T - 0.15, whoosh(0.5), 0.2)
sfx.add(MAIN_T + 1.4, click(), 0.6); sfx.add(MAIN_T + 1.4, pop(), 0.25)

# the clip's own sound on the 1x pieces: keyboard clacks + his '아!' (lifted)
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", SRC, "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                     capture_output=True, check=True).stdout
clip = sosfilt(butter(2, 110, 'hp', fs=SR, output='sos'), np.frombuffer(raw, np.int16).astype(float) / 32768)
room = Track()
for o0, o1, s0, sp in EDL:
    if sp != 1: continue
    a_ = clip[int(s0 * SR):int((s0 + o1 - o0) * SR)].copy()
    m = len(a_); a_ *= np.minimum(1, np.minimum(np.arange(m) / (0.02 * SR), (m - np.arange(m)) / (0.03 * SR)))
    room.add(o0, a_, 1.0)
lift = np.ones(N)
mus_rms = np.sqrt(np.mean(((mus.L + mus.R) / 2)[int(3 * SR):int(5 * SR)] ** 2))
typing = np.concatenate([room.L[int((o0 + a0 - s0) * SR):int((o0 + a1 - s0) * SR)] for o0, o1, s0, sp in EDL if sp == 1 for a0, a1 in SQUEALS if s0 <= a0 < s0 + (o1 - o0)])
gr = mus_rms * 1.6 / (np.sqrt(np.mean(typing ** 2)) + 1e-9) / np.sqrt(0.5)   # squeals ~4 dB over the music
sq = np.full(N, 0.3)                    # keep the room quiet outside his squeals (the clip is very quiet, so its hiss would rise)
for o0, o1, s0, sp in EDL:
    if sp != 1: continue
    for a0, a1 in SQUEALS:
        if s0 <= a0 < s0 + (o1 - o0):
            q0, q1 = o0 + a0 - s0, o0 + a1 - s0
            sq = np.maximum(sq, np.clip(np.minimum((t - q0 + 0.12) / 0.06, (q1 + 0.15 - t) / 0.1), 0, 1))
room.L *= gr * lift * sq; room.R *= gr * lift * sq
print("room gain", round(20 * np.log10(gr), 1), "dB")

L_ = mus.L + end.L + sfx.L + room.L; R_ = mus.R + end.R + sfx.R + room.R
hp2 = butter(2, 45, 'hp', fs=SR, output='sos'); L_ = sosfilt(hp2, L_); R_ = sosfilt(hp2, R_)
x = np.stack([L_, R_], 1)
x *= np.clip((TOTAL - t) / 0.6, 0, 1)[:, None]
x = x / (np.abs(x).max() + 1e-9) * 0.6
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
print("ok", N / SR, "s")
