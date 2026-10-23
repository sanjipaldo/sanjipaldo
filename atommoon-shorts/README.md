# 아톰문 성장일기 쇼츠 템플릿

헬멧 쓴 아기 승유의 하루하루를 같은 포맷의 YouTube 쇼츠(1080x1920)로 만드는 도구입니다.
영상·사진 원본은 이 저장소에 올리지 않습니다 (`.gitignore` 참고).

## 한 편의 구성

| 구간 | 내용 |
| --- | --- |
| 0–2초 | 훅 문구 (예: "입으로 물고기를 잡는다고?! 😲") |
| 본편 | 제목 + `📔 승유 성장일기 EP.xx · 생후 N개월` 배지, 장면 자막, 포인트 순간 줌인·"앙!"·물방울 효과 |
| 승유 목소리 | 소리 나는 동안 음악을 거의 끄고(-24 dB) 원음을 키움, "음~" 말풍선·음표·소리 물결 |
| 다시 듣기 | 되감기 효과 → 목소리 구간을 음악 없이 다시 재생 (`🔊 소리 켜고 들어보세요!`) |
| 오늘의 승유 | 일기장 카드 (날짜·개월 수·한 줄 일기 3개, "참 잘했어요" 도장) |
| 구독 카드 | 캐릭터 아이콘, 아톰문, 구독 버튼, "다음 성장일기도 기대해 주세요" |

음악과 효과음은 `scripts/music.py`가 직접 합성하는 자작곡이라 저작권 신고 걱정이 없습니다.

## 다음 편 만들기

1. `episodes/ep01.json`을 복사해 `episodes/ep02.json`을 만들고 내용을 바꿉니다.
   - `episode`, `date`, `age`, `title`, `hook`, `captions`, `diary`
   - `voices` / `replay`: `python3 scripts/find_voices.py 영상.mp4`가 찾아준 승유 목소리 구간
   - `bites` / `lifts` / `success`: 효과를 넣을 순간(초), `head_keys`: 머리 위치(원본 픽셀)
2. 실행:
   ```bash
   ./make_episode.sh episodes/ep02.json /path/to/영상.mp4
   ```
3. 결과: `work/out/ep02_short.mp4`, 표지 `work/out/cover_ep02.jpg`, 배너 `work/out/channel_banner_2560x1440.jpg`

미리보기 스틸만 뽑기:
```bash
python3 scripts/render.py work episodes/ep02.json 영상.mp4 work/stills --stills 1.0,5.0,20.0
```

## 필요한 것

`ffmpeg`, `rsvg-convert`(librsvg2-bin), 나눔 글꼴(`fonts-nanum`), Noto Color Emoji,
Python 패키지 `numpy`, `scipy`, `pillow`.
