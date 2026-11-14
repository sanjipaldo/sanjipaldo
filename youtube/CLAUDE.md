# 유튜브 영상 작업 (두고보는 문대표 채널)

HyperFrames(HTML → MP4)로 쇼츠·롱폼을 편집하는 작업 폴더. 두고마켓 웹앱과는 무관하고 배포되지 않는다(`.vercelignore`).

## 세션 시작

1. `bash youtube/setup.sh` — CLI 0.9.46, Chrome, whisper.cpp + `large-v3-turbo`, 폰트. 새 컨테이너에서 2~3분.
2. 다운로드가 있는 `hyperframes` 명령(transcribe 첫 실행, `add`, `catalog`) 앞에는 `export NODE_USE_ENV_PROXY=1`. 없으면 `getaddrinfo ENOTFOUND`.
3. 스킬: `.claude/skills/{hyperframes,hyperframes-cli,hyperframes-registry,media-use}` (공식 저장소 그대로, `skills-lock.json`). 영상 작업 전에 `/hyperframes`부터 읽는다.

## 한국어 음성 인식

- `hyperframes transcribe <파일> --model large-v3-turbo --language ko --json`. `.en` 모델 금지 (한국어를 영어로 번역함). CLI 기본값이 `small.en`이라 `--model`을 반드시 준다.
- 무음 구간에서 "한글자막 by 한효정", "시청해주셔서 감사합니다" 같은 가짜 문장이 나온다. 무음 구간의 단어는 버린다.
- 사용자가 준 대본과 위치 기준으로 대조해 오탈자를 고친다. 자막은 실제로 말한 내용 기준.
- NG 컷: `media-use` 스킬의 `transcript-cut.mjs` (`--remove`, `--cut-silence 0.8`). 사용자는 틀리면 2초 쉬고 문장을 처음부터 다시 말한다 → 마지막 테이크를 남긴다.

## 쇼츠 포맷 (레퍼런스: 게으른빌더 「클로드 코드에 같은 요청을…」 45초)

분석 근거: 스토리보드(약 1초 간격 50컷), 1080×1920 프레임 1장, 유튜브 자동자막. googlevideo.com이 막혀 원본 영상은 못 받았다.

- 1080×1920, 30fps, 45~60초. 말 속도 빠름(약 2.5어절/초), 화면 변화 1~2초마다.
- 구성: 훅(0~3초, 고민 질문) → 해결 약속 → "방법 바로 알려줄게요" → 번호 단계 3~4개(각 5~6초) → 혜택 → 댓글 키워드 CTA("댓글에 'OO' 남기면 보내드려요").
- 화면 3종을 번갈아 쓴다
  - FACE: 얼굴 전체 화면, 천천히 펀치인(1.00→1.06)
  - SPLIT: 위 0~960 그래픽 패널, 아래 960~1920 얼굴. 얼굴 영상을 `translateY(640px)` + `clip-path: inset(50% 0 0 0)` → 원본 y 320~1280 구간이 보임
  - GRAPHIC: 그래픽 전체 화면
- 자막: 가운데 띠 `top: 838px`, 2줄, Pretendard 900 88px, 1줄 흰색 + 2줄 브랜드 색. 한 줄 6~10자. SPLIT에서는 경계선(960)에 걸친다.
- 브랜드 색: **빨강 확정**(사용자 확인). 기본값 `--accent: #FF3B3B`, 로고 PNG를 받으면 로고의 빨강으로 맞춘다.
- 그래픽: 어두운 남색 바탕(#0B0E17→#161B2C) + UI 카드, 실제 제품 화면·화면 녹화는 창 프레임 안에. 세로 안전영역: 위 168px·아래 1330px 아래에는 글자 금지.
- 기준 구현: `youtube/shorts-format/index.html` (9초 시안, 얼굴은 실루엣 자리표시). 실제 영상은 `youtube/projects/<날짜>-<제목>/`에 만들고, 스킬 권장대로 장면을 sub-composition으로 나눈다.
- 촬영 구도 전제: 세로, 가슴 위, 정수리가 위에서 약 23%, 눈높이 약 1/3.

## 파일 주고받기

- 원본은 구글 드라이브 공유 링크("링크가 있는 모든 사용자")로 받는다:
  `curl -L "https://drive.usercontent.google.com/download?id=<ID>&export=download&confirm=t" -o assets/face.mp4`
- 영상·음원은 커밋하지 않는다(`youtube/.gitignore`). 완성 MP4는 SendUserFile로 전달.
- 레퍼런스 분석: `yt-dlp --write-auto-subs --sub-langs ko`(자막), `-f sb0`(스토리보드), `https://i.ytimg.com/vi/<ID>/oar2.jpg`(세로 원본 비율 프레임).
