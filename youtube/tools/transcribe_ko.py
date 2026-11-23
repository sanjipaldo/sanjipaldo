"""WhisperX로 한국어 음성을 받아쓰고 단어(어절)마다 시작·끝 시간을 정렬한다.

    HF_HUB_DISABLE_XET=1 ~/.cache/video-ai/wx/bin/python youtube/tools/transcribe_ko.py <음성·영상 파일> <출력.json>

출력은 HyperFrames 캡션이 그대로 읽는 단어 배열이다:
    [{"id": "w0", "text": "안녕하세요", "start": 0.25, "end": 0.91}, ...]
대본과 위치 기준으로 대조해 오탈자를 고친 뒤 자막에 쓴다.
"""
import json
import sys
import time

import whisperx


def main(src: str, out: str, model_name: str = "large-v3-turbo") -> None:
    t0 = time.time()
    audio = whisperx.load_audio(src)
    model = whisperx.load_model(model_name, device="cpu", compute_type="int8", language="ko")
    result = model.transcribe(audio, batch_size=4, language="ko")
    align_model, meta = whisperx.load_align_model(language_code="ko", device="cpu")
    aligned = whisperx.align(result["segments"], align_model, meta, audio, device="cpu",
                             return_char_alignments=False)

    words = []
    for seg in aligned["segments"]:
        for w in seg.get("words", []):
            if w.get("start") is None or w.get("end") is None:
                continue  # 숫자·기호처럼 정렬이 안 된 토큰은 앞뒤 단어 사이로 사람이 맞춘다
            words.append({"id": f"w{len(words)}", "text": w["word"].strip(),
                          "start": round(w["start"], 3), "end": round(w["end"], 3)})

    with open(out, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False, indent=1)
    text = " ".join(s["text"].strip() for s in result["segments"])
    print(f"{len(words)} words, {time.time() - t0:.1f}s -> {out}\n{text}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(*sys.argv[1:4])
