# Seedance 2.0 영상 교체 가이드

홈페이지에 지금 들어가 있는 영상은 **임시 영상**입니다. 기획서에 있는 마을 일러스트를 카메라가 7개 사업 건물 순서로 훑는 영상으로 만들었습니다.
이 폴더에는 **Seedance 2.0**(Higgsfield)으로 진짜 영상을 만들 때 필요한 것이 다 들어 있습니다.

| 파일 | 내용 |
|---|---|
| `shots.json` | 11개 장면(스토리보드 그대로)의 프롬프트, 길이, 시작 프레임, 내레이션, 편집 규칙 |
| `keyframes/S01~S11.webp` | 장면별 시작 프레임 (마을 일러스트에서 잘라낸 1280×720) |
| `character-ref.png` | 파란 캐릭터 참고 이미지 |
| `assemble.py` | 생성한 클립을 홈페이지용 영상으로 자동 편집하고 교체하는 스크립트 |

## 1. 생성 (Higgsfield · Seedance 2.0)
- 모델 `seedance_2_0`, 16:9, `generate_audio: false` (배경 영상은 무음)
- 장면마다: `start_image` = `keyframes/Sxx-*.webp`, 프롬프트 = `shots.json`의 prompt (`{mascot}`, `{style}`을 같은 파일의 문구로 바꿔 넣음)
  - 캐릭터 얼굴이 흔들리면 `image_references`에 `character-ref.png`를 추가하거나, 시작 프레임 대신 참고 이미지 방식으로 다시 생성
- 길이: 4초 × 8개 + 5초 × 3개 = 총 47초

예상 크레딧 (2026-10-13 Higgsfield 견적 기준)

| 품질 | 크레딧 |
|---|---|
| 1080p · std (최종 권장) | 약 423 |
| 720p · std | 약 212 |
| 720p · fast (시안 확인용) | 약 118 |

> 이 작업 시점의 계정 잔액은 5.2크레딧이었습니다. 그래서 아직 생성하지 않았습니다.

## 2. 교체
1. 받은 클립을 `tools/seedance/clips/S01.mp4` ~ `S11.mp4` 이름으로 저장
2. `python3 tools/seedance/assemble.py`  (음악·내레이션이 있으면 `--film-audio 파일.mp3`)
3. `assets/video/`의 같은 이름 파일이 바뀌므로 HTML은 고치지 않아도 됩니다.
   - `hero-loop.mp4`: 메인 배경(26초). 장면 경계 시간이 그대로라서 메인 화면 아래 장면 표시기(PRODUCT·BRAND…)와 맞습니다.
   - `group-film.mp4`: '그룹 영상 보기'(약 43초). 자막(`group-film.ko.vtt`)은 자동으로 다시 계산됩니다.
   - `biz-*.mp4`: 사업별 반복 영상 7개

최종 영상을 직접 편집해서 받는 경우에는 같은 파일 이름으로 `assets/video/`에 덮어쓰면 됩니다. 메인 영상의 장면 시간이 달라지면 `index.html` 히어로 장면 표시기의 `data-start`·`data-end` 값도 같이 바꿔 주세요.
