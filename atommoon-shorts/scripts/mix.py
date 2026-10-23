"""Mix the baby's real audio (emphasised under each "음~", replayed in the replay section) with BGM/SFX.

usage: mix.py EPISODE.json SRC.mp4 BGM.wav OUT.wav
Writes an un-normalised mix; loudness normalisation happens in ffmpeg afterwards.
"""
import os, subprocess, sys, wave
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from episode import Episode

EP = Episode(sys.argv[1]); SRC, BGM, OUT = sys.argv[2:5]
SR = 48000
VOICES = [(a, b) for a, b, _ in EP["voices"]]

def read(path):
    w = wave.open(path)
    x = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
    return x.reshape(-1, w.getnchannels())

tmp = OUT + ".orig.wav"
# gentle clean-up of the phone audio: rumble cut, light denoise, a touch of presence for the voice
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", SRC, "-vn", "-ac", "2", "-ar", str(SR),
                "-af", "highpass=f=90,afftdn=nr=10:nf=-50,equalizer=f=2500:t=q:w=1.2:g=3", tmp], check=True)
orig = read(tmp)
# afftdn delays the signal by a few tens of ms; measure against the untouched audio and shift back
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", SRC, "-vn", "-ac", "2", "-ar", str(SR), tmp], check=True)
dry = read(tmp); os.remove(tmp)
a, b = orig[:12 * SR, 0], dry[:12 * SR, 0]
n = 1 << int(np.ceil(np.log2(len(a) + len(b))))
xc = np.fft.irfft(np.fft.rfft(a, n) * np.conj(np.fft.rfft(b, n)), n)
lag = int(np.argmax(np.concatenate([xc[-2000:], xc[:2000]]))) - 2000
if lag > 0:
    orig = np.concatenate([orig[lag:], np.zeros((lag, 2), np.float32)])
print(f"denoise latency compensated: {lag / SR * 1000:.1f} ms")
bgm = read(BGM)

def rms(x):
    return float(np.sqrt(np.mean(x ** 2)) + 1e-9)

# voice gain: put the "음~" clearly above the normal music level
voice = np.concatenate([orig[int(a * SR):int(b * SR)] for a, b in VOICES])
quiet = [(0.3, 2.5), (6.0, 11.5), (25.0, 30.0)]
music_lvl = rms(np.concatenate([bgm[int(a * SR):int(b * SR)] for a, b in quiet]))
base_g = 10 ** (9 / 20)
voice_g = np.clip(music_lvl * 10 ** (3 / 20) / rms(voice), base_g, 10 ** (22 / 20))
print(f"voice gain {20 * np.log10(voice_g):.1f} dB (base 9 dB)")

n_main = int(EP.main_end * SR)
t = np.arange(n_main) / SR
g = np.full(n_main, base_g)
for a, b in VOICES:
    k = np.clip(np.minimum((t - a + 0.12) / 0.1, (b + 0.25 - t) / 0.15), 0, 1)
    g = np.maximum(g, base_g + (voice_g - base_g) * k)

out = np.zeros((int(EP.total * SR) + SR, 2), np.float32)
out[:n_main] += orig[:n_main] * g[:, None]
for o0, o1, s0, s1, _ in EP.replay:                  # the replay: the real voice, no music
    seg = orig[int(s0 * SR):int(s1 * SR)].copy() * voice_g
    f = int(0.03 * SR); ramp = np.linspace(0, 1, f)[:, None]
    seg[:f] *= ramp; seg[-f:] *= ramp[::-1]
    i = int(o0 * SR); out[i:i + len(seg)] += seg
out = out[:len(bgm)]
out += bgm[:len(out)]
peak = np.abs(out).max()
if peak > 0.95:
    out *= 0.95 / peak
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype(np.int16).tobytes())
print("ok", len(out) / SR, "s")
