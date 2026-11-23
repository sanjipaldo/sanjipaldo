"""CosyVoice3(Fun-CosyVoice3-0.5B)로 한국어 문장을 음성으로 만든다.

    ~/.cache/video-ai/cv/bin/python youtube/tools/tts_ko.py "<문장>" <출력.wav> [<목소리 샘플.wav> "<샘플에서 말한 문장>"]

- 목소리 샘플을 주면 그 목소리로 읽는다(zero-shot). 대표님 본인 목소리 10~20초, 잡음 없는 구간만 쓴다.
  다른 사람 목소리는 본인 동의 없이 쓰지 않는다.
- 샘플이 없으면 CosyVoice 기본 예시 목소리로 읽는다(시험용).
- CPU에서는 음성 길이의 약 4배 시간이 걸린다(8초 음성 → 약 33초).
"""
import os
import sys
import time

CV = os.path.expanduser("~/.cache/video-ai/CosyVoice")
sys.path[:0] = [CV, CV + "/third_party/Matcha-TTS"]

import torch  # noqa: E402
import torchaudio  # noqa: E402
from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402

PREFIX = "You are a helpful assistant.<|endofprompt|>"


def main(text: str, out: str, prompt_wav: str | None = None, prompt_text: str | None = None) -> None:
    torch.set_num_threads(os.cpu_count() or 4)
    model = AutoModel(model_dir=CV + "/pretrained_models/Fun-CosyVoice3-0.5B")
    t0 = time.time()
    if prompt_wav and prompt_text:
        gen = model.inference_zero_shot(text, PREFIX + prompt_text, prompt_wav, stream=False)
    else:
        gen = model.inference_cross_lingual(PREFIX + text, prompt_wav or CV + "/asset/zero_shot_prompt.wav",
                                            stream=False)
    wav = torch.cat([chunk["tts_speech"] for chunk in gen], dim=1)
    torchaudio.save(out, wav, model.sample_rate)
    dur = wav.shape[1] / model.sample_rate
    print(f"{dur:.1f}s audio in {time.time() - t0:.1f}s -> {out}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(*sys.argv[1:5])
