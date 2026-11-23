#!/usr/bin/env bash
# 영상 품질용 추가 도구 설치. 필요한 세션에서만 실행한다 (새 컨테이너 기준 15~20분, 약 10GB).
#   - WhisperX 3.8.6  : 한국어 단어별 자막 타이밍      → ~/.cache/video-ai/wx
#   - CosyVoice3      : 한국어 내레이션·목소리 복제     → ~/.cache/video-ai/cv, ~/.cache/video-ai/CosyVoice
#   - Blender 4.0 + MCP for Blender 2.3.1 : 3D 장면       → apt, ~/.config/blender/<ver>/scripts/addons
#   - Remotion 4.0.546 : 코드 기반 영상 (보조)            → youtube/remotion/node_modules
# FFmpeg 은 기본 설치돼 있다. HyperFrames·한국어 whisper.cpp 는 youtube/setup.sh 가 맡는다.
# 다시 실행해도 안전하다 (이미 있는 것은 건너뜀). 필요한 허용 주소: download.pytorch.org,
# download-r2.pytorch.org, huggingface.co, us.aws.cdn.hf.co (모두 환경에 추가돼 있음).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AI="${HOME}/.cache/video-ai"
mkdir -p "${AI}"
export HF_HUB_DISABLE_XET=1          # Xet 전송 서버는 막혀 있다. 일반 HTTP 다운로드로 받는다
export NODE_USE_ENV_PROXY=1
TORCH_CPU="--index-url https://download.pytorch.org/whl/cpu"

echo "[1/5] 시스템 패키지 (Blender, 가상 화면)"
if ! command -v blender >/dev/null || ! command -v xvfb-run >/dev/null || ! python3.12 -c "import requests" 2>/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq blender xvfb python3-requests >/dev/null
fi

echo "[2/5] MCP for Blender 애드온"
BVER="$(blender --version 2>/dev/null | awk '/^Blender/{split($2,v,"."); print v[1]"."v[2]; exit}')"
ADDONS="${HOME}/.config/blender/${BVER}/scripts/addons"
if [ ! -f "${ADDONS}/blender_mcp.py" ]; then
  mkdir -p "${ADDONS}"
  PKG="$(uvx --from mcp-for-blender@2.3.1 python -c 'import blender_mcp,os;print(os.path.dirname(blender_mcp.__file__))' | tail -1)"
  cp "${PKG}/bundled/addon.py" "${ADDONS}/blender_mcp.py"
fi

echo "[3/5] WhisperX"
if ! "${AI}/wx/bin/python" -c "import whisperx" 2>/dev/null; then
  python3.12 -m venv "${AI}/wx"
  "${AI}/wx/bin/pip" install -q --upgrade pip
  "${AI}/wx/bin/pip" install -q ${TORCH_CPU} torch==2.8.0 torchaudio==2.8.0 torchvision==0.23.0
  "${AI}/wx/bin/pip" install -q whisperx==3.8.6
fi
if [ ! -d "${HOME}/nltk_data/tokenizers/punkt_tab" ]; then
  # nltk.download() 은 이 환경에서 Security Violation 으로 실패한다. 직접 받는다
  mkdir -p "${HOME}/nltk_data/tokenizers"
  curl -sS -L -o "${HOME}/nltk_data/tokenizers/punkt_tab.zip" \
    https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/tokenizers/punkt_tab.zip
  (cd "${HOME}/nltk_data/tokenizers" && python3 -m zipfile -e punkt_tab.zip .)
fi

echo "[4/5] CosyVoice3"
if [ ! -d "${AI}/CosyVoice" ]; then
  git clone -q --recursive https://github.com/FunAudioLLM/CosyVoice.git "${AI}/CosyVoice"
  git -C "${AI}/CosyVoice" checkout -q 074ca6d
  git -C "${AI}/CosyVoice" submodule update -q --init --recursive
fi
if ! "${AI}/cv/bin/python" -c "import torch, hyperpyyaml, whisper, onnxruntime" 2>/dev/null; then
  python3.11 -m venv "${AI}/cv"
  "${AI}/cv/bin/pip" install -q --upgrade pip "setuptools<70" wheel
  "${AI}/cv/bin/pip" install -q ${TORCH_CPU} torch==2.3.1 torchaudio==2.3.1
  "${AI}/cv/bin/pip" install -q --no-build-isolation openai-whisper==20231117
  # requirements.txt 에서 GPU 전용(deepspeed, onnxruntime-gpu, tensorrt)과 웹 UI 를 뺀 CPU 추론용 목록
  "${AI}/cv/bin/pip" install -q conformer==0.3.2 diffusers==0.29.0 HyperPyYAML==1.2.3 inflect==7.3.1 \
    librosa==0.10.2 lightning==2.2.4 matplotlib==3.7.5 modelscope==1.20.0 networkx==3.1 numpy==1.26.4 \
    omegaconf==2.3.0 onnx==1.16.0 onnxruntime==1.18.0 "protobuf==4.25.*" pyarrow==18.1.0 pydantic==2.7.0 \
    pyworld==0.3.4 rich==13.7.1 soundfile==0.12.1 transformers==4.51.3 x-transformers==2.11.24 \
    wetext==0.0.4 wget==3.2 gdown==5.1.0 hydra-core==1.3.2 tensorboard==2.14.0
fi
M="${AI}/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B"
B="https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512/resolve/main"
mkdir -p "${M}/CosyVoice-BlankEN"
for f in config.json configuration.json cosyvoice3.yaml CosyVoice-BlankEN/config.json \
         CosyVoice-BlankEN/generation_config.json CosyVoice-BlankEN/merges.txt \
         CosyVoice-BlankEN/tokenizer_config.json CosyVoice-BlankEN/vocab.json \
         CosyVoice-BlankEN/model.safetensors campplus.onnx hift.pt speech_tokenizer_v3.onnx flow.pt; do
  [ -s "${M}/${f}" ] || curl -sS -L --retry 3 -o "${M}/${f}" "${B}/${f}"
done
# 강화학습 버전(llm.rl.pt)이 발음 오류가 더 적다. 코드가 읽는 이름(llm.pt)으로 받는다
[ -s "${M}/llm.pt" ] || curl -sS -L --retry 3 -o "${M}/llm.pt" "${B}/llm.rl.pt"

echo "[5/5] Remotion"
if [ ! -d "${HERE}/remotion/node_modules/remotion" ]; then
  (cd "${HERE}/remotion" && npm install --no-audit --no-fund >/dev/null)
fi
mkdir -p "${HERE}/remotion/public/fonts"
FONTS="${HOME}/.cache/youtube-tools/node_modules/pretendard/dist/web/static/woff2"
[ -d "${FONTS}" ] && cp "${FONTS}"/Pretendard-{Black,Bold}.woff2 "${HERE}/remotion/public/fonts/" || echo "  (폰트는 youtube/setup.sh 를 먼저 돌리면 채워진다)"

echo
echo "준비 완료"
echo "  WhisperX : HF_HUB_DISABLE_XET=1 ${AI}/wx/bin/python youtube/tools/transcribe_ko.py <파일> <출력.json>"
echo "  CosyVoice: ${AI}/cv/bin/python youtube/tools/tts_ko.py \"<문장>\" <출력.wav>"
echo "  Blender  : xvfb-run -a -s \"-screen 0 1280x720x24\" blender --python youtube/blender/start_mcp.py &"
echo "  Remotion : cd youtube/remotion && npx remotion render <id> out/x.mp4 --browser-executable=\"\$(hyperframes browser path | tail -1)\""
