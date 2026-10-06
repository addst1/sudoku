# 스도쿠 PWA

빌드 과정 없이 정적 파일만으로 동작하는 스도쿠 앱입니다. 설치하면 앱처럼 실행되고, 오프라인에서도 플레이할 수 있어요.

## 기능

- 난이도별 퍼즐 생성 (쉬움 / 보통 / 어려움), 모든 퍼즐은 **유일해** 보장
  - 쉬움·보통: 단일 후보 / 숨은 단일만으로 풀 수 있는 퍼즐
  - 어려움: 그 이상의 추리가 필요한 퍼즐 (단서 26~30개)
- 메모(후보 숫자), 되돌리기 / 다시 실행, 지우기
- 힌트 (선택한 칸 또는 첫 번째 틀린/빈 칸을 채움)
- 하트 시스템: 기본 3개, 오답을 넣을 때마다 하나씩 줄고 모두 잃으면 게임 오버 (같은 퍼즐 다시 도전 가능). 설정에서 1~10개로 변경하며, 새 게임부터 적용
- 오류 표시, 같은 줄·칸·숫자 강조 (설정에서 끌 수 있음)
- 진행 자동 저장 / 이어하기, 난이도별 기록 (완성 수, 최단·평균 시간, 연승)
- 일시정지, 라이트 / 다크 / 자동 테마 (홈 화면 우측 상단의 해/달 버튼으로 바로 전환, 게임 중에도 톱니바퀴 버튼으로 설정 열기)
- 키보드 지원: `1`–`9` 입력, `Backspace` 지우기, 방향키 이동, `N` 메모, `H` 힌트, `P` 일시정지, `Ctrl+Z` / `Ctrl+Y` 되돌리기·다시 실행

## 파일 구성

```
index.html            화면 구조
style.css             스타일 (라이트/다크)
sudoku.js             퍼즐 생성·풀이 엔진 (브라우저와 Node 모두에서 동작)
app.js                UI·게임 로직·저장
sw.js                 서비스 워커 (오프라인 캐시)
manifest.webmanifest  PWA 매니페스트
icons/                아이콘 (192, 512, maskable, apple-touch, svg)
```

## 로컬에서 실행

```bash
cd sudoku-pwa
python3 -m http.server 8080
# 브라우저에서 http://localhost:8080
```

서비스 워커는 `https://` 또는 `localhost`에서만 동작해요. `index.html`을 더블클릭(file://)으로 열면 게임은 되지만 PWA 기능(설치·오프라인)은 쓸 수 없습니다.

## 배포

HTTPS를 제공하는 정적 호스팅이면 어디든 됩니다. 폴더 안의 파일을 그대로 올리세요.

- **GitHub Pages**: 저장소에 올리고 Settings → Pages에서 브랜치 선택
- **Netlify / Cloudflare Pages / Vercel**: 폴더를 드래그 앤 드롭 하거나 저장소 연결 (빌드 명령 없음, 출력 폴더는 루트)

모든 경로가 상대 경로라서 `https://사용자.github.io/저장소/` 같은 하위 경로에 올려도 동작합니다.

`manifest.webmanifest`는 `application/manifest+json`으로 서빙되는 것이 이상적이지만, 대부분의 호스팅은 알아서 처리해 줍니다.

## 업데이트 배포 방법 (중요)

앱 파일은 서비스 워커가 캐시하기 때문에, 파일을 수정해서 다시 올릴 때는 **`sw.js` 맨 위의 `VERSION`을 올려야** 사용자에게 반영됩니다.

```js
const VERSION = 'v3';   // 현재 v2 → v3
```

버전이 바뀌면 사용자 화면에 "새 버전이 있어요 [업데이트]" 알림이 뜨고, 누르면 새 파일로 교체됩니다. 게임 도중에 갑자기 새로고침되지 않도록 자동 적용하지 않았어요. 진행 중인 게임은 저장된 상태로 이어집니다.

## 설치 방법

- **Android / 데스크톱 Chrome·Edge**: 홈 화면의 "설치" 버튼 또는 주소창의 설치 아이콘
- **iPhone / iPad (Safari)**: 공유 버튼 → "홈 화면에 추가"

## 데이터 저장 위치

브라우저 `localStorage`를 사용합니다. 기기와 브라우저마다 따로 저장되고, 사이트 데이터를 지우면 기록도 함께 사라져요.

| 키 | 내용 |
| --- | --- |
| `sudoku.game.v1` | 진행 중인 게임 |
| `sudoku.stats.v1` | 난이도별 기록 |
| `sudoku.settings.v1` | 설정 |

## 난이도 조정

`sudoku.js`의 `LEVELS`에서 목표 단서 수(`target`)를 바꾸면 됩니다. 단서가 적을수록 어려워져요.

```js
const LEVELS = {
  easy:   { target: 42, singles: true,  mustBeHard: false },
  medium: { target: 34, singles: true,  mustBeHard: false },
  hard:   { target: 27, singles: false, mustBeHard: true  },
};
```
