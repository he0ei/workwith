# workwith · 모아 업무 관리

4명(대표님, 승재 책임님, 승연 주임님, 재희 주임)의 프로젝트·업무·일정을 관리하는 웹앱입니다. 정적 프런트엔드와 Cloudflare Worker API, D1 공유 DB로 구성합니다. Google Material Design 3 기반 테마를 사용합니다. 외부 의존성이나 유료 AI 서비스는 없습니다.

## 실행

Node.js 24 이상에서 실행합니다.

```sh
node scripts/dev.mjs
node --test tests/*.test.mjs
node scripts/build.mjs
```

개발 주소는 http://localhost:4173 입니다. 개발 서버는 D1에서 사용하는 SQL을 로컬 SQLite로 실행하며 `.wrangler/local/workwith.sqlite`에 저장합니다. 이것은 개발 전용이며 여러 컴퓨터의 공유 DB가 아닙니다. 운영은 Worker의 `DB` 바인딩을 통해 실제 D1에 저장합니다. `file://`로 열면 API를 사용할 수 없습니다. `npm run preview`는 정적 파일만 확인하는 서버입니다.

계정의 최초 설정에는 서버 환경변수 `SETUP_TOKEN`이 필요합니다. 실제 비밀번호나 설정 코드를 소스·PR·채팅에 넣지 마세요. 자세한 운영 설정은 [OPERATIONS.md](OPERATIONS.md)를 참고하세요.

## Cloudflare 배포

`wrangler.json`에는 Worker API, `dist/` 정적 assets와 D1 바인딩이 선언되어 있습니다. 현재 계정의 `workwith-db` DB ID를 사용합니다. 다른 계정에서는 ID를 변경해야 합니다. DB ID는 접근 키가 아닙니다.

| 항목 | 설정 |
|---|---|
| 운영 브랜치 | `main` |
| 루트 디렉터리 | 저장소 루트 |
| 빌드 명령 | `node scripts/build.mjs` 또는 빈 값 |
| 배포 명령 | `npx wrangler deploy` |
| DB 바인딩 | `DB` → `workwith-db` |
| 최초 스키마 | `migrations/0001_shared.sql` |

새 DB에는 `npx wrangler d1 migrations apply workwith-db --remote`를 실행합니다. 이번 계정에서는 대시보드 Console에서 동일한 스키마를 생성했습니다. SQL은 다시 적용해도 데이터를 초기화하지 않습니다.

배포 명령에 `--assets .`를 붙이지 마세요. 현재 서비스 주소는 `https://workwith.he0ei31.workers.dev/`입니다. 코드의 PR 생성은 운영 배포·로그인 설정 완료를 의미하지 않습니다.

GitHub Pages로 화면을 나누는 경우 Worker API는 계속 필요합니다. `src/config.js`의 `API_BASE`, Worker의 `ALLOWED_ORIGIN` 및 index.html CSP의 connect-src를 실제 API 주소로 한정해 설정해야 합니다. 현재는 같은 Worker가 화면과 API를 제공합니다. GitHub Pages 배포는 이번 변경에 포함되지 않습니다.

## 기능

- 프로젝트·업무 CRUD, 담당자·상태·우선순위, 공동/개인 업무 통합 조회
- 오늘·이번 주·지연·완료 필터 및 월 캘린더
- 계획일·마감일·예상 시간·실제 완료일, 일정 변경 사유와 이력
- 선행 업무·순환 차단·완료 전 선행 업무 확인
- KPI 목표·현재·단위·계산 방식, 결과물 URL, 변경 이력
- 회의록 양식에서 초안 생성·수정·선택·검토 후 등록

최초 실행은 빈 워크스페이스입니다. 프로젝트와 업무를 직접 등록합니다. 백업·복원, 예시 불러오기, 초기화 메뉴는 제공하지 않습니다. 합성 데이터는 테스트 fixture에서만 사용합니다.

회의록 양식(한 줄당 업무 하나):

```text
# 설명은 원문에 보관
기획안 작성 | 승재 책임님 | 2026-10-20 | 높음
콘텐츠 발행 | 재희 주임 | | 보통 | 발행 수 | 12 | 건
```

담당자·날짜가 명확하지 않으면 미지정·확인 필요로 남깁니다. 자연어 AI 분석은 하지 않습니다. KPI 필드는 선택이며 프로젝트 연결이 필요합니다.

## 저장과 권한

업무 데이터의 localStorage 저장과 시연 사용자 전환을 제거했습니다. 서버는 로그인 세션에서 사용자를 결정하고 요청의 사용자 이름을 신뢰하지 않습니다. 비밀번호는 사용자별 salt를 적용한 PBKDF2-SHA256 해시로만 저장합니다. 브라우저에는 8시간 만료 세션만 보관하며 로그아웃하면 서버 세션도 폐기합니다.

공유 업무·프로젝트·KPI·결과물·회의록은 네 팀원이 조회·수정할 수 있습니다. 개인 업무와 개인 변경 이력은 서버에서 소유자에게만 전달합니다. D1에는 Supabase RLS가 없으므로 Worker가 보안 경계이며, Cloudflare 계정의 DB 관리자는 원본 DB에 접근할 수 있습니다.

30초마다 작은 revision 응답만 확인하고 변경이 있을 때 데이터를 불러옵니다. 대표님은 60초입니다. 숨겨진 탭은 폴링을 중단하고 탭 복귀·창 포커스·저장 후에는 최신 데이터를 조회합니다. 전체 페이지 새로고침은 하지 않습니다. 열린 편집 폼과 회의록 검토 입력은 유지합니다.

각 레코드의 version을 저장 시 비교합니다. 다른 항목의 변경은 합쳐서 저장하고 같은 항목의 오래된 수정은 409로 차단합니다. 프로젝트 등 연쇄 삭제·회의록 일괄 등록은 전체 revision을 확인합니다. D1 batch 트랜잭션과 workspace CAS가 충돌 시 부분 저장을 방지합니다. 한 요청은 최대 94개 레코드 변경까지 허용합니다.

서버 연결 또는 저장 실패 시 로컬 저장으로 전환하거나 성공으로 표시하지 않습니다. 기존 로컬 시연 데이터는 자동 업로드·삭제하지 않습니다. 공유 DB는 빈 상태에서 시작하며 회사 자료가 GitHub에 저장되지 않습니다.

프로젝트 삭제는 연결 업무·KPI·결과물도 삭제하고 회의록 연결을 해제합니다. 삭제 취소는 제공하지 않습니다. 날짜는 Asia/Seoul 기준입니다.

## GitHub 개발 흐름

대상 저장소: https://github.com/he0ei/workwith

기존 원격 코드 확인 → 작업 브랜치 생성 → 코드 수정 → 테스트·빌드 → 커밋·푸시 → PR 생성 순서로 진행합니다. PR 병합은 별도 지시가 있어야 수행합니다. GitHub 토큰·비밀번호를 웹앱에 넣거나 브라우저에서 Git 명령을 실행하지 않습니다. 로그인된 개발 환경 또는 연결된 GitHub 도구를 사용합니다.

## 파일 구성

- src/app.js: 기존 화면·폼과 로그인·동기화 이벤트
- src/shared-store.js, src/config.js: 공유 API 저장 계층과 공개 API 주소
- src/model.js: 모델·검증·업무 명령·규칙 파서
- worker/: 인증·권한·트랜잭션 API
- migrations/: D1 SQL 스키마
- scripts/: 정적 빌드·개발 서버·테스트 SQL 어댑터
- tests/: 모델·API·화면 통합 검증
- OPERATIONS.md: 최초 계정 설정·배포·무료 한도·운영 검증
- VERIFICATION.md: 실제 실행 결과와 검증 한계
