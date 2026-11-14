#!/usr/bin/env bash
# 유튜브 영상 작업 환경 준비. 새 클라우드 세션에서 한 번 실행한다 (처음엔 2~3분).
#   - HyperFrames CLI(버전 고정) + 렌더용 Chrome
#   - 한국어 음성 인식: whisper.cpp 빌드 + large-v3-turbo 모델(1.6GB)
#   - 템플릿 assets 에 한글 폰트(Pretendard)와 GSAP 채우기
# 다시 실행해도 안전하다 (이미 있는 것은 건너뜀).
set -euo pipefail

HF_VERSION="0.9.46"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Node 의 fetch 는 HTTPS_PROXY 를 안 읽는다. 이게 없으면 모델·카탈로그 다운로드가 실패한다.
export NODE_USE_ENV_PROXY=1

echo "[1/4] HyperFrames CLI ${HF_VERSION}"
if [ "$(hyperframes --version 2>/dev/null || true)" != "${HF_VERSION}" ]; then
  npm i -g --no-audit --no-fund "hyperframes@${HF_VERSION}" >/dev/null
fi

echo "[2/4] 렌더용 Chrome"
hyperframes browser ensure >/dev/null

echo "[3/4] 한국어 음성 인식 (whisper.cpp + large-v3-turbo)"
WDIR="${HOME}/.cache/hyperframes/whisper"
if [ ! -f "${WDIR}/models/ggml-large-v3-turbo.bin" ] || [ ! -x "${WDIR}/whisper.cpp/build/bin/whisper-cli" ]; then
  tmp="$(mktemp -d)"
  ffmpeg -v error -f lavfi -i anullsrc=r=16000:cl=mono -t 1 "${tmp}/silence.wav"
  # 무음 1초를 한 번 전사하면 CLI 가 whisper.cpp 를 빌드하고 모델을 받아 둔다
  (cd "${tmp}" && hyperframes transcribe silence.wav --model large-v3-turbo --language ko --json >/dev/null 2>&1) || true
  rm -rf "${tmp}"
fi
[ -f "${WDIR}/models/ggml-large-v3-turbo.bin" ] || { echo "모델 다운로드 실패: huggingface.co, us.aws.cdn.hf.co 허용 여부 확인"; exit 1; }

echo "[4/4] 폰트·GSAP"
TOOLS="${HOME}/.cache/youtube-tools"
mkdir -p "${TOOLS}"
if [ ! -d "${TOOLS}/node_modules/pretendard" ] || [ ! -d "${TOOLS}/node_modules/gsap" ]; then
  (cd "${TOOLS}" && { [ -f package.json ] || npm init -y >/dev/null; } && npm i --no-audit --no-fund pretendard@1.3.9 gsap@3.13.0 >/dev/null)
fi
for proj in "${HERE}"/shorts-format "${HERE}"/projects/*/; do
  [ -f "${proj}/index.html" ] || continue
  mkdir -p "${proj}/assets/fonts"
  cp "${TOOLS}/node_modules/gsap/dist/gsap.min.js" "${proj}/assets/"
  cp "${TOOLS}"/node_modules/pretendard/dist/web/static/woff2/Pretendard-{Black,ExtraBold,Bold,SemiBold}.woff2 "${proj}/assets/fonts/"
done

echo "준비 완료: hyperframes $(hyperframes --version)"
