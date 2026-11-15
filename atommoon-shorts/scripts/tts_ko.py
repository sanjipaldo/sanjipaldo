"""Korean speech with the Supertonic-3 ONNX models (OpenRAIL-M), run locally with onnxruntime.
Only the model files (ONNX graphs, tts.json, unicode_indexer.json, voice-style JSON) are read; the pipeline
(text -> duration -> text embedding -> flow-matching latent -> vocoder) is implemented here.

usage: tts_ko.py ASSETS_DIR LINES.json OUT_DIR [--steps N] [--seed S]
  LINES.json: [{"id": "l01", "text": "...", "voice": "F3", "speed": 1.05}, ...]  ->  OUT_DIR/<id>.wav
"""
import json, os, re, sys
from unicodedata import normalize
import numpy as np
import onnxruntime as ort
import soundfile as sf

assets, lines_p, out_dir = sys.argv[1:4]
steps = int(sys.argv[sys.argv.index("--steps") + 1]) if "--steps" in sys.argv else 16
seed = int(sys.argv[sys.argv.index("--seed") + 1]) if "--seed" in sys.argv else 7
onnx_dir = os.path.join(assets, "onnx")

cfg = json.load(open(os.path.join(onnx_dir, "tts.json")))
SR = cfg["ae"]["sample_rate"]
CHUNK = cfg["ae"]["base_chunk_size"] * cfg["ttl"]["chunk_compress_factor"]
LDIM = cfg["ttl"]["latent_dim"] * cfg["ttl"]["chunk_compress_factor"]
INDEXER = json.load(open(os.path.join(onnx_dir, "unicode_indexer.json")))
opts = ort.SessionOptions()
sess = {n: ort.InferenceSession(os.path.join(onnx_dir, f"{n}.onnx"), sess_options=opts, providers=["CPUExecutionProvider"])
        for n in ("duration_predictor", "text_encoder", "vector_estimator", "vocoder")}


def prep(text, lang="ko"):
    text = normalize("NFKD", text)
    text = re.sub("[\U0001f300-\U0001faff☀-➿]+", "", text)
    for a, b in {"–": "-", "—": "-", "_": " ", "“": '"', "”": '"', "‘": "'", "’": "'", "~": ","}.items():
        text = text.replace(a, b)
    text = re.sub(r" ([,.!?;:'])", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    if not re.search(r"[.!?;:,'\"…]$", text):
        text += "."
    return f"<{lang}>{text}</{lang}>"


def mask(lengths, max_len=None):
    max_len = int(max_len or lengths.max())
    return (np.arange(max_len)[None, :] < lengths[:, None]).astype(np.float32).reshape(-1, 1, max_len)


def style(voice):
    d = json.load(open(os.path.join(assets, "voice_styles", f"{voice}.json")))
    ttl = np.array(d["style_ttl"]["data"], dtype=np.float32).reshape(d["style_ttl"]["dims"])
    dp = np.array(d["style_dp"]["data"], dtype=np.float32).reshape(d["style_dp"]["dims"])
    return ttl, dp


def speak(text, voice, speed, rng):
    t = prep(text)
    ids = np.array([[INDEXER[ord(c)] for c in t]], dtype=np.int64)
    tmask = mask(np.array([ids.shape[1]]))
    ttl, dp = style(voice)
    dur, *_ = sess["duration_predictor"].run(None, {"text_ids": ids, "style_dp": dp, "text_mask": tmask})
    dur = dur / speed
    emb, *_ = sess["text_encoder"].run(None, {"text_ids": ids, "style_ttl": ttl, "text_mask": tmask})
    wav_len = (dur * SR).astype(np.int64)
    lat_len = (wav_len + CHUNK - 1) // CHUNK
    lmask = mask(lat_len)
    xt = rng.standard_normal((1, LDIM, int(lat_len.max()))).astype(np.float32) * lmask
    tot = np.array([steps], dtype=np.float32)
    for k in range(steps):
        xt, *_ = sess["vector_estimator"].run(None, {"noisy_latent": xt, "text_emb": emb, "style_ttl": ttl, "text_mask": tmask,
                                                     "latent_mask": lmask, "current_step": np.array([k], dtype=np.float32),
                                                     "total_step": tot})
    wav, *_ = sess["vocoder"].run(None, {"latent": xt})
    return wav[0, :int(wav_len[0])]


os.makedirs(out_dir, exist_ok=True)
for ln in json.load(open(lines_p, encoding="utf-8")):
    rng = np.random.default_rng(seed)
    w = speak(ln["text"], ln.get("voice", "F1"), ln.get("speed", 1.05), rng)
    sf.write(os.path.join(out_dir, f"{ln['id']}.wav"), w, SR)
    print(ln["id"], ln.get("voice"), f"{len(w) / SR:.2f}s", flush=True)
