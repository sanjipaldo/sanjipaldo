"""List the baby's voiced sounds ("음~", 옹알이) in a clip, to fill the "voices" / "replay" fields of an episode.

usage: find_voices.py SRC.mp4
"""
import subprocess, sys
import numpy as np

SR = 16000
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", sys.argv[1], "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
                     capture_output=True, check=True).stdout
x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
win, hop = 640, 320                                   # 40 ms windows, 20 ms hop
rows = []
for i in range(0, len(x) - win, hop):
    fr = x[i:i + win] * np.hanning(win)
    ac = np.correlate(fr, fr, "full")[win - 1:]
    lo, hi = SR // 900, SR // 120
    lag = lo + np.argmax(ac[lo:hi])
    rows.append((i / SR, 20 * np.log10(np.sqrt(np.mean(fr ** 2)) + 1e-9), ac[lag] / (ac[0] + 1e-9), SR / lag))
rows = np.array(rows)
# periodic (voiced), above the room noise, in a baby's pitch range
voiced = (rows[:, 2] > 0.45) & (rows[:, 1] > -52) & (rows[:, 3] > 200) & (rows[:, 3] < 700)
segs, start = [], None
for k, v in enumerate(voiced):
    if v and start is None:
        start = k
    if (not v or k == len(voiced) - 1) and start is not None:
        if k - start >= 3:
            segs.append([start, k])
        start = None
merged = []
for a, b in segs:                                     # bridge gaps shorter than 120 ms
    if merged and a - merged[-1][1] <= 6:
        merged[-1][1] = b
    else:
        merged.append([a, b])
for a, b in merged:
    r = rows[a:b]
    print(f"{rows[a, 0]:6.2f} - {rows[b, 0]:6.2f} s  ({rows[b, 0] - rows[a, 0]:.2f} s)  "
          f"peak {r[:, 1].max():6.1f} dB  pitch {np.median(r[:, 3]):4.0f} Hz")
