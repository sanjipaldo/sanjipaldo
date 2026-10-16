# 두고그룹 홈페이지 (DOOGO GROUP)

(주)두고홀딩스와 7개 계열 사업을 한 번에 보여주는 그룹 홈페이지입니다.
기획안(`DOOGO_GROUP 회사 소개 홈페이지 기획안`)을 바탕으로 만들었고, 아래 세 곳을 레퍼런스로 삼았습니다.
- **플레이디(PLAYD)**: 영상 중심 첫 화면, 큰 제목, 사업 리스트, 포트폴리오, 뉴스룸, 문의 구성
- **패스트파이브**: 서비스마다 명확한 설명과 해당 서비스로 가는 버튼
- **글로우업리즈**: 사업 소개와 인물 프로필을 함께 보여주는 구성

프레임워크와 빌드 과정 없이 HTML·CSS·JS 파일로만 되어 있습니다. 폴더를 그대로 웹 서버에 올리면 됩니다.

## 미리 보기
```bash
cd doogo-group
python3 -m http.server 4180
# 브라우저에서 http://localhost:4180 열기
```
> 파일을 더블클릭해서(file://) 열면 영상 자막 같은 일부 기능이 브라우저 보안 정책 때문에 동작하지 않습니다. 위처럼 로컬 서버로 여세요.

## 페이지
| 파일 | 내용 |
|---|---|
| `index.html` | 메인 — 영상 첫 화면 · 그룹 소개 · 그룹 구조 · 7개 사업 · 가치사슬 · 리더십 · 브랜드와 사례 · 소식 · 문의 |
| `about.html` | 두고그룹 — 그룹 소개 · 비전과 철학 · 그룹 구조 · 주요 연혁 · 국내외 거점 |
| `business.html` | 사업영역 전체 |
| `business-campus.html` ~ `business-space.html` | 7개 사업 상세 (교육·제조·커머스·미디어·광고·유통·공간) |
| `leadership.html` | 리더십 — 그룹 대표 · 사업을 이끄는 사람들 |
| `brands.html` | 브랜드와 성과 — 운영 브랜드 · 프로젝트 · 성장 사례 · 협력 파트너 |
| `news.html` | 그룹소식 — 공지 · 사업 소식 · 교육 현장 · 채용 소식 |
| `contact.html` | 문의하기 — 문의 분야 선택 + 접수 |
| `privacy.html` | 개인정보처리방침 (초안) |

## 폴더
```
doogo-group/
├── *.html                    각 페이지
├── partials/                 모든 페이지가 같이 쓰는 헤더·푸터 원본
│   ├── header.html           로고 · 상단 메뉴 · 사업영역 메가메뉴 · 모바일 메뉴 · 아이콘
│   ├── footer.html           푸터 · 패밀리 사이트 · 그룹 영상 창
│   └── _template.html        새 페이지를 만들 때 복사할 틀
├── assets/
│   ├── css/base.css          색 · 글꼴 · 버튼 · 헤더 · 푸터 등 공통 디자인
│   ├── css/pages/*.css       페이지별 디자인
│   ├── js/site.js            메뉴 · 스크롤 등장 · 영상 자동재생 · 영상 창 등 공통 동작
│   ├── js/pages/*.js         페이지별 동작
│   ├── img/                  로고(SVG) · 사업 이미지 · 대표 사진 · 공유 이미지
│   ├── video/                메인 배경 · 그룹 영상(자막 포함) · 사업별 반복 영상
│   └── fonts/pretendard/     Pretendard 글꼴 (SIL OFL)
└── tools/
    ├── sync-partials.mjs     헤더·푸터를 고친 뒤 모든 페이지에 반영
    ├── stamp-assets.mjs      CSS·JS 주소에 버전(?v=내용 해시)을 붙여 휴대폰 캐시에 옛 파일이 남지 않게 함
    └── seedance/             Seedance 2.0 영상 생성·교체 도구 (README 참고)
```

## 자주 하는 수정
- **사업 페이지 8개(사업영역 + 7개 상세)**: 문구는 `tools/build-business.mjs`의 데이터를 고친 뒤 `node tools/build-business.mjs`로 다시 만듭니다.
- **메뉴·푸터 고치기**: `partials/header.html` 또는 `partials/footer.html`을 고친 다음 `node tools/sync-partials.mjs`를 실행하면 모든 페이지에 반영됩니다.
- **CSS·JS 고친 뒤**: `node tools/stamp-assets.mjs`를 꼭 실행합니다(위 두 도구는 끝에 자동 실행). `assets/`는 7일 캐시라, 버전이 바뀌지 않으면 한 번 들어왔던 기기에 옛 디자인이 남습니다.
- **색·글꼴**: `assets/css/base.css` 맨 위 `:root`의 값을 바꿉니다. 그룹 블루는 `--blue: #0A5DE2`(로고 색)입니다.
- **영상 교체**: `assets/video/`에 같은 파일 이름으로 덮어씁니다. Seedance 2.0으로 만들 때는 `tools/seedance/README.md`를 보세요.
- **문의 접수 연결**: `contact.html`의 `<form id="inquiryForm" data-endpoint="">`에 접수 주소(폼 서비스, 사내 API 등)를 넣으면 JSON으로 전송합니다. 비워 두면 시안 모드라서 실제로 전송되지 않습니다.

## 지금 들어간 임시 자료와 확정이 필요한 자료
화면에서 예시 콘텐츠에는 노란 **샘플** 표시나 "확정 후 게시" 문구가 붙어 있습니다.

| 확정할 자료 | 지금 상태 | 바꿀 곳 |
|---|---|---|
| 메인 영상 · 그룹 영상 | 기획서 마을 일러스트로 만든 임시 영상 (카메라 이동 + 자막) | `assets/video/` · `tools/seedance/` |
| 사업별 현장 사진 | 그룹 구성 이미지에서 잘라낸 장면 (해상도 낮음) · 그룹 구성 이미지의 BIO NZ 국기는 호주 국기로 그려져 있어 뉴질랜드 국기로 고쳐 둠 | `assets/img/biz/*-scene.webp`, `assets/img/scene/ecosystem.webp` |
| 대표자 이름·직함·사진 | 문원오 그룹 대표만 있음 (기획서의 두고클래스 강사 화면 사진에서 배경을 걷어낸 컷아웃), 나머지는 "프로필 준비 중" | `assets/img/people/`, `leadership.html`, 각 사업 상세 |
| 교육 명칭 | 사업명 DOOGO CAMPUS, 온라인 클래스 서비스 '두고클래스'로 정리함 (같은 브랜드인지 확인 필요) | 전체 |
| 법인·브랜드 관계 | "(주)두고홀딩스 아래 7개 계열 사업"으로 표기 | `about.html#structure`, 메인 그룹 구조 |
| 연혁 · 소식 · 사례 · 파트너 | 샘플 | `about.html`, `news.html`, `brands.html` |
| 회사 주소 · 연락처 · 사업자번호 | "확정 후 게시" | `partials/footer.html` → sync |
| 서비스 사이트 주소 | DOOGO MARKET만 연결함 (`doogofood-ops-hub.eugenemoon.chatgpt.site`), 두고클래스·NORA STAY·SNS는 누르면 "주소가 확정되면 연결됩니다" 안내 | `data-pending`이 붙은 링크 |
| 문의 수신처 | 시안 모드 | `contact.html`의 `data-endpoint` |
| 개인정보처리방침 | 초안 | `privacy.html` |
