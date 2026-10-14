# workwith · 모아 업무 관리

4명 팀의 업무·프로젝트·캘린더·회의록·KPI·결과물 링크를 연결합니다. 기존 Material 화면과 업무 모델을 유지하며 GitHub Pages 정적 화면 + Supabase Auth/PostgreSQL/RLS/Edge Function 구조로 전환합니다. 실제 서비스 연결 전 검토용 변경이며 배포 완료로 표시하지 않습니다.

## 실행·검증

Node.js 24, pnpm 11.25.0 사용:

```sh
pnpm install --frozen-lockfile --ignore-scripts
node --test tests/*.test.mjs
node scripts/build.mjs
node scripts/serve.mjs
```

PGlite 0.5.9는 PostgreSQL/RLS SQL 검증 전용 개발 의존성입니다. 프런트엔드 번들에는 포함하지 않습니다. 테스트는 사용자·회사 업무 데이터를 사용하지 않습니다.

배포 빌드는 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` 환경변수를 읽어 dist/src/config.js와 프로젝트 주소만 허용하는 CSP를 생성합니다. 비밀 키·service_role·sb_secret 키는 거부합니다. GitHub Pages workflow는 변수 누락 시 실패하여 연결되지 않은 화면을 배포하지 않습니다. 설정 없이 로컬 빌드하면 미연결 안내만 표시합니다.

```sh
SUPABASE_URL=https://your-project.supabase.co SUPABASE_PUBLISHABLE_KEY=sb_publishable_example node scripts/build.mjs
```

위는 형식 설명이며 실제 접속 가능한 프로젝트나 키가 아닙니다. `dist/`는 정적 배포 산출물, supabase/functions/_shared는 정본 모델에서 생성되는 서버 모듈입니다. 두 폴더는 커밋하지 않습니다. `file://` 대신 HTTP 주소를 사용합니다.

## 구조

- `.github/workflows/pages.yml`: GitHub Actions 테스트·빌드·Pages 배포
- `src/app.js`: 기존 화면·폼, 이메일 로그인, 30초/60초 변경 확인
- `src/shared-store.js`: Supabase Auth, 세션 갱신, 읽기 RPC와 변경 Edge Function 호출
- `src/model.js`: 단일 업무 모델·검증·규칙 기반 회의록 처리
- `server/workspace.js`: 서버 업무 명령·버전 충돌·변경 차이 계산
- `server/supabase-handler.js`: Auth 사용자 검증·팀원 확인·서버 저장 경계
- `supabase/migrations/202610140001_workspace.sql`: PostgreSQL 테이블, RLS, 트랜잭션 RPC
- `supabase/functions/workspace/index.ts`: Edge Function 진입점
- `scripts/build-functions.mjs`: 기존 모델을 재사용하는 함수 소스 생성
- `tests/`: 모델·실제 PostgreSQL/RLS·Auth 저장 계층·화면·Edge 경계 테스트

## 기능과 접근 범위

공동 업무와 개인 업무는 한 레코드를 각각의 화면에서 조회합니다. 상태·우선순위·담당자·일정·KPI·결과물 링크·회의록 검토 등록을 유지합니다. 공유 데이터는 등록된 팀원이 편집하며 개인 업무와 개인 이력은 DB RLS와 서버 검사를 통해 본인에게만 표시합니다.

30초마다 revision을 확인합니다. 대표님은 60초이며 숨겨진 탭은 중단하고 복귀·포커스·저장 시 다시 확인합니다. 편집 중 폼을 지우지 않습니다. 레코드별 version이 달라지면 409로 오래된 수정을 막고, 서로 다른 카드 수정은 재시도하여 보존합니다. 연쇄 삭제·회의록 일괄 등록은 전체 revision을 확인합니다. 모든 변경은 PostgreSQL 함수의 한 트랜잭션으로 저장합니다.

업무 데이터는 브라우저 localStorage 또는 GitHub에 저장하지 않습니다. sessionStorage에는 Supabase 세션 토큰만 보관합니다. DB 조회·쓰기 실패를 성공으로 표시하거나 로컬 저장으로 대체하지 않습니다. 실제 연결을 위한 설정은 [OPERATIONS.md](OPERATIONS.md), 검증 범위는 [VERIFICATION.md](VERIFICATION.md)를 참고하세요.

## 전환 상태

사용자 승인에 따라 GitHub 저장소를 공개로 변경하고 Pages의 GitHub Actions 배포 설정을 활성화했습니다. 유료 업그레이드는 하지 않았습니다. Supabase Free의 DB/RLS/Edge 함수 적용과 GitHub 공개 변수 연결을 완료했습니다. PR #7 병합과 Pages 배포를 완료했습니다. 팀원 계정 등록·멤버 연결과 실제 여러 컴퓨터의 동기화 검증은 남아 있으며, 현재는 사용자 요청에 따라 로그인 설정을 보류하고 디자인 작업을 진행합니다. 기존 Cloudflare Worker/D1은 원격에서 삭제하지 않았습니다.

## Atlassian 디자인과 로그인 없는 미리보기

화면은 [Atlassian Design System](https://atlassian.design/foundations/color)의 의미별 색상, 8px 간격, 선택/포커스 표시, 간결한 입력과 배지 원칙을 기존 vanilla HTML/CSS에 적용합니다. React Atlaskit 런타임 도입이 아닙니다. Material 테마 참조와 모아 명칭은 제거했습니다. 대시보드는 담당자별 업무량 없이 프로젝트 현황·이번 주 업무·KPI를 중심으로 배치합니다.

로그인 없이 `?preview=1`로 전체 화면을 확인할 수 있고 로그인 화면에도 미리보기 버튼이 있습니다. 파일을 직접 여는 경우에도 빈 상태의 디자인 미리보기로 시작합니다. 미리보기는 실제 DB·세션·회사 데이터를 읽지 않으며 저장과 폴링을 수행하지 않습니다. 데이터 백업·샘플 준비 기능은 추가하지 않았습니다. 실제 데이터 접근은 기존 Supabase Auth/RLS를 유지합니다.

## 회의록 붙여 넣기

팀원 표시는 정승재·양승연·최재희입니다. 기존 사용자 ID는 유지합니다. 회의록 텍스트를 붙여 넣으면 프로젝트명/목표와 목록·업무 항목을 규칙으로 추출해 편집 가능한 초안을 표시합니다. 일반 본문은 원문으로 보관하며 완전한 자연어 이해는 제공하지 않습니다. 상대 날짜·복수 담당자·여러 날짜는 확인 필요로 남깁니다. 기존 `|` 구분 입력도 지원합니다.

기본 선택은 새 프로젝트 생성이며 기존 프로젝트에 추가하거나 프로젝트 없이 공유 업무로 등록할 수도 있습니다. 검토 후 등록 시 프로젝트·회의록·업무·선택적 KPI를 하나의 PostgreSQL 트랜잭션으로 저장하고 프로젝트 상세로 이동합니다. 미리보기에서는 초안 표시만 가능하며 실제 저장에는 등록된 팀원 인증이 필요합니다.
