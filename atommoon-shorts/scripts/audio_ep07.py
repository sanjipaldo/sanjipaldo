"""EP07 audio (upgraded): a lo-fi office groove (electric-piano chords, soft boom-bap, bass, vinyl crackle) that
ducks under the AI voices and drops out for the deadpan line; the clip's real keyboard clacks and his real '아!';
the kid / team-leader voice lines (the messenger line gets a phone EQ); notification chimes, a swipe, clock flips,
a time-lapse tick-riser, burst pops, a success chime, '퇴근 보고' dings + stamp, and the EP01 ending chord.

usage: audio_ep07.py SRC.mp4 VOICE_DIR OUT_RAW.wav
"""
import subprocess, sys, wave
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

SRC, VDIR, OUT = sys.argv[1:4]
SR = 48000
MAIN_T, TOTAL = 28.85, 31.65
N = int(TOTAL * SR)
rng = np.random.default_rng(7)
t = np.arange(N) / SR

EDL = [(0.0, 2.6, 11.0), (2.6, 6.6, 0.0), (6.6, 10.6, 5.0), (10.6, 12.2, 9.0), (12.2, 14.6, 13.6),
       (14.6, 17.6, 16.0), (17.6, 20.5, 19.0), (20.5, 22.5, 21.9), (22.5, 25.85, 23.9)]
LINES = [(0.35, "k1"), (3.0, "k2"), (7.3, "k3"), (11.0, "b1"), (13.0, "k4"), (15.75, "b2"), (17.75, "k5"), (24.2, "k7")]
DEADPAN = (12.75, 14.1)
NOTIF = [10.8, 22.6]
CLOCK = [2.6, 6.6, 10.6, 14.6, 17.6, 21.3, 22.6]
TIMELAPSE = (20.5, 21.3)
BURSTS = [15.6, 24.2]
CARD = 25.85


def note_hz(name):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    return 440 * 2 ** ((names[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)

def env(n, a=0.005, d=0.3):
    tt = np.arange(n) / SR
    e = np.exp(-tt / d); na = max(1, int(a * SR)); e[:na] *= np.linspace(0, 1, na)
    return e

def bp(x, lo, hi):
    return sosfilt(butter(2, [lo, hi], 'bp', fs=SR, output='sos'), x)

def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'lp', fs=SR, output='sos'), x)

class Track:
    def __init__(self): self.L = np.zeros(N); self.R = np.zeros(N)
    def add(self, t0, sig, gain=1.0, pan=0.0):
        i = int(t0 * SR); j = min(N, i + len(sig))
        if i < 0 or i >= N: return
        self.L[i:j] += sig[:j - i] * gain * np.sqrt(0.5 * (1 - pan))
        self.R[i:j] += sig[:j - i] * gain * np.sqrt(0.5 * (1 + pan))


# ---------------------------------------------------------------- lo-fi groove (88 BPM, swung)
BPM = 88; BEAT = 60 / BPM; BAR = 4 * BEAT; SWING = 0.18 * BEAT

def rhodes(f, dur):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * tt) + 0.22 * np.sin(4 * np.pi * f * tt) * np.exp(-tt / 0.6) \
        + 0.12 * np.sin(2 * np.pi * 7 * f * tt) * np.exp(-tt / 0.05)
    s *= 1 + 0.12 * np.sin(2 * np.pi * 4.8 * tt)          # tremolo
    e = env(n, 0.004, 1.4); rel = min(n, int(0.08 * SR)); e[-rel:] *= np.linspace(1, 0, rel)
    return s * e

def kick():
    n = int(0.3 * SR); tt = np.arange(n) / SR
    return np.sin(2 * np.pi * np.cumsum(48 + 70 * np.exp(-tt / 0.035)) / SR) * env(n, 0.002, 0.13)

def snare():
    n = int(0.25 * SR); tt = np.arange(n) / SR
    body = np.sin(2 * np.pi * 190 * tt) * env(n, 0.001, 0.05)
    nz = bp(rng.uniform(-1, 1, n), 900, 5000) * env(n, 0.001, 0.09)
    return lp(0.5 * body + nz, 4500)

def hat(dec=0.03):
    n = int(0.1 * SR)
    return sosfilt(butter(3, 6500, 'hp', fs=SR, output='sos'), rng.uniform(-1, 1, n)) * env(n, 0.001, dec)

def bassnote(f, dur):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(4 * np.pi * f * tt) * np.exp(-tt / 0.2)
    e = env(n, 0.01, 0.9); rel = min(n, int(0.05 * SR)); e[-rel:] *= np.linspace(1, 0, rel)
    return s * e

CH = [("Fmaj7", ["F3", "A3", "C4", "E4"], "F2"), ("Em7", ["E3", "G3", "B3", "D4"], "E2"),
      ("Dm7", ["D3", "F3", "A3", "C4"], "D2"), ("Cmaj7", ["C3", "E3", "G3", "B3"], "C2")]
MEL = [[(0, 'C5'), (1.5, 'A4'), (2.5, 'G4')], [(0.5, 'B4'), (2, 'G4'), (3, 'D5')],
       [(0, 'A4'), (1.5, 'C5'), (2.5, 'F4')], [(0.5, 'E4'), (2, 'G4')]]
mus = Track()
nbars = int(np.ceil(MAIN_T / BAR)) + 1
for b in range(nbars):
    t0 = b * BAR; name, notes, root = CH[b % 4]
    for pos, g in [(0, 1.0), (1.5, 0.6), (2.75, 0.45)]:
        tp = t0 + pos * BEAT + (SWING if (pos * 2) % 2 == 1 else 0)
        for k, nm in enumerate(notes):
            mus.add(tp + k * 0.008, rhodes(note_hz(nm), 1.6), 0.10 * g, pan=-0.2 + 0.13 * k)
    mus.add(t0, bassnote(note_hz(root), BEAT * 1.6), 0.30)
    mus.add(t0 + 2.5 * BEAT + SWING, bassnote(note_hz(root) * 1.5, BEAT * 0.9), 0.20)
    if b >= 1:
        for pos in (0, 2.5):
            mus.add(t0 + pos * BEAT + (SWING if pos == 2.5 else 0), kick(), 0.55)
        for pos in (1, 3):
            mus.add(t0 + pos * BEAT, snare(), 0.32, pan=0.1)
        for e8 in range(8):
            mus.add(t0 + e8 * BEAT / 2 + (SWING if e8 % 2 else 0), hat(0.02 if e8 % 2 else 0.035), 0.06 if e8 % 2 else 0.10, pan=0.35)
    if b >= 2:
        for pos, nm in MEL[b % 4]:
            mus.add(t0 + pos * BEAT, rhodes(note_hz(nm), 0.9), 0.07, pan=0.25)
crack = np.zeros(N)
for _ in range(int(TOTAL * 9)):
    i = rng.integers(0, N - 200); crack[i:i + 60] += rng.uniform(-1, 1, 60) * np.hanning(60) * rng.uniform(0.2, 1)
crack += lp(rng.uniform(-1, 1, N), 1800) * 0.05
mus.L += crack * 0.02; mus.R += crack * 0.02
mus.L = lp(mus.L, 6500); mus.R = lp(mus.R, 6500)

# ---------------------------------------------------------------- voices
def load(name):
    y, sr = sf.read(f"{VDIR}/{name}.wav")
    y = y.mean(1) if y.ndim > 1 else y
    return resample_poly(y, SR, sr)

voice = Track(); venv = np.zeros(N)
for t0, name in LINES:
    y = load(name)
    if name == "b1":                    # messenger voice: phone band + a touch of grit
        y = np.tanh(bp(y, 320, 3400) * 2.2) * 0.6
    elif name.startswith("k"):          # small room on the kid voice
        wet = np.zeros(len(y) + int(0.12 * SR))
        for dly, g in [(0.023, 0.22), (0.041, 0.15), (0.067, 0.1), (0.093, 0.06)]:
            i = int(dly * SR); wet[i:i + len(y)] += y * g
        y = np.concatenate([y, np.zeros(len(wet) - len(y))]) + lp(wet, 5000)
    voice.add(t0, y, 0.9)
    i = int(t0 * SR); venv[i:i + len(y)] = 1
duck = np.convolve(venv, np.ones(int(0.12 * SR)) / int(0.12 * SR), mode="same")
duck = np.clip(duck * 1.6, 0, 1)

# ---------------------------------------------------------------- the clip's own sound (keys + his '아!')
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", SRC, "-vn", "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                     capture_output=True, check=True).stdout
clip = np.frombuffer(raw, np.int16).astype(float) / 32768
clip = sosfilt(butter(2, 110, 'hp', fs=SR, output='sos'), clip)
room = Track()
for o0, o1, s0 in EDL:
    a = clip[int(s0 * SR):int((s0 + o1 - o0) * SR)].copy()
    m = len(a); a *= np.minimum(1, np.minimum(np.arange(m) / (0.02 * SR), (m - np.arange(m)) / (0.03 * SR)))
    room.add(o0, a, 1.0)

# ---------------------------------------------------------------- sfx
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
def bell(f, dur=0.9):
    n = int(dur * SR); tt = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2.76 * tt) * np.exp(-tt / 0.15)) * env(n, 0.002, 0.45)
def chime():
    out = np.zeros(int(0.9 * SR))
    for dt, nm in [(0.0, 'E6'), (0.12, 'A6')]:
        b = bell(note_hz(nm), 0.75); i = int(dt * SR); out[i:i + len(b)] += b
    return out
def tick():
    n = int(0.03 * SR)
    return bp(rng.uniform(-1, 1, n), 2500, 7000) * env(n, 0.0005, 0.006)
def thump():
    n = int(0.3 * SR); tt = np.arange(n) / SR
    low = np.sin(2 * np.pi * np.cumsum(70 + 110 * np.exp(-tt / 0.02)) / SR) * env(n, 0.001, 0.09)
    return low + 0.5 * bp(rng.uniform(-1, 1, n), 200, 2500) * env(n, 0.0005, 0.02)
def click():
    n = int(0.05 * SR)
    return sosfilt(butter(2, 2500, 'hp', fs=SR, output='sos'), rng.uniform(-1, 1, n)) * env(n, 0.0005, 0.008)

sfx = Track()
for i_, nm in enumerate(['C6', 'E6', 'G6']):                    # hook sparkle
    sfx.add(0.05 + i_ * 0.07, bell(note_hz(nm), 0.8), 0.07)
sfx.add(2.45, whoosh(0.35), 0.12)
for i_, nm in enumerate(['C5', 'G5', 'C6', 'E6']):              # 'computer on' chime as the window opens
    sfx.add(2.9 + i_ * 0.09, bell(note_hz(nm), 1.0), 0.06, pan=0.3)
sfx.add(2.9, whoosh(0.3), 0.08, pan=-0.4)                        # name tag slides in
for tn in NOTIF:
    sfx.add(tn, chime(), 0.16, pan=0.2)
sfx.add(14.1, whoosh(0.3, up=False), 0.14, pan=-0.5)            # notification swiped away
for tc in CLOCK:
    sfx.add(tc, tick(), 0.25, pan=-0.5)
k = 0.0                                                          # time-lapse: ticks speeding up + riser
while TIMELAPSE[0] + k < TIMELAPSE[1]:
    sfx.add(TIMELAPSE[0] + k, tick(), 0.2, pan=-0.5); k += max(0.03, 0.12 - 0.11 * k / 0.8)
sfx.add(TIMELAPSE[0] - 0.05, whoosh(0.9), 0.12)
for tb in BURSTS:
    sfx.add(tb, pop(), 0.24)
for i_, nm in enumerate(['C6', 'E6', 'G6', 'C7', 'E7']):        # 칼퇴 success
    sfx.add(24.35 + i_ * 0.07, bell(note_hz(nm), 1.0), 0.09, pan=-0.5 + i_ * 0.25)
sfx.add(CARD - 0.15, whoosh(0.35), 0.13)
for k_, nm in enumerate(['E6', 'G6', 'C7', 'E7']):
    sfx.add(CARD + 0.35 + 0.3 * k_, bell(note_hz(nm), 0.8), 0.08)
sfx.add(CARD + 1.75, thump(), 0.5); sfx.add(CARD + 1.75, pop(), 0.14)
end = Track()                                                    # ending chord over the subscribe card
for k_, nm in enumerate(["F3", "A3", "C4", "E4", "G4"]):
    end.add(MAIN_T + k_ * 0.02, rhodes(note_hz(nm), 2.6), 0.12, pan=-0.2 + 0.1 * k_)
end.add(MAIN_T, bassnote(note_hz("F2"), 2.2), 0.3)
end.add(MAIN_T + 1.4, click(), 0.6); end.add(MAIN_T + 1.4, pop(), 0.25)

# ---------------------------------------------------------------- mix
g = np.ones(N)
k_ = np.clip(np.minimum((t - DEADPAN[0]) / 0.04, (DEADPAN[1] - t) / 0.08), 0, 1)
g = np.minimum(g, 1 - k_)                                        # deadpan: music out
g *= 1 - 0.55 * duck                                             # under the voices
g *= np.clip(t / 0.05, 0, 1) * np.clip((MAIN_T - t) / 0.3, 0, 1)
mus.L *= g; mus.R *= g
mus_rms = np.sqrt(np.mean(((mus.L + mus.R) / 2)[int(3 * SR):int(6 * SR)] ** 2))
typing = np.concatenate([room.L[int(a * SR):int(b * SR)] for a, b in [(2.9, 5.0), (15.6, 17.6)]])
gr = mus_rms * 1.1 / (np.sqrt(np.mean(typing ** 2)) + 1e-9) / np.sqrt(0.5)
rg = gr * (1 - 0.35 * duck)
room.L *= rg; room.R *= rg
v_rms = np.sqrt(np.mean(voice.L[venv > 0] ** 2))
gv = mus_rms * 3.2 / (v_rms + 1e-9)
voice.L *= gv; voice.R *= gv
print("room gain", round(20 * np.log10(gr), 1), "dB  voice gain", round(20 * np.log10(gv), 1), "dB")

L = mus.L + voice.L + room.L + sfx.L + end.L
R = mus.R + voice.R + room.R + sfx.R + end.R
hp = butter(2, 40, 'hp', fs=SR, output='sos'); L = sosfilt(hp, L); R = sosfilt(hp, R)
x = np.stack([L, R], 1)
x *= np.clip((TOTAL - t) / 0.6, 0, 1)[:, None]
x = x / (np.abs(x).max() + 1e-9) * 0.6
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
print("ok", N / SR, "s")
