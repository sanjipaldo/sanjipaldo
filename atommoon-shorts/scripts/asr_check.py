"""Transcribe WAV files with faster-whisper (local) to check that synthesized Korean lines are intelligible.

usage: asr_check.py MODEL_DIR WAV [WAV ...]
"""
import sys
import numpy as np, soundfile as sf
from scipy.signal import resample_poly
from faster_whisper import WhisperModel

model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8")
for p in sys.argv[2:]:
    y, sr = sf.read(p)
    y = y.mean(1) if y.ndim > 1 else y
    y = resample_poly(y, 16000, sr).astype(np.float32)
    segs, _ = model.transcribe(y, language="ko", beam_size=5)
    print(p.rsplit("/", 1)[-1], "->", " ".join(s.text.strip() for s in segs))
