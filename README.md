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

## 구역 기반 회의록 검토

회의록 전체를 붙여 넣습니다. 줄 구분자와 공백을 정규화하고 번호 제목은 문서 구역으로 읽습니다. 후속 업무·향후 계획 및 검토 과제·현재 담당 업무에서 실행 후보를 추출하며, 설명 구역의 명시적 실행 표현도 검토 후보로 표시합니다. 기대 역할과 일반 사업 설명은 업무로 자동 등록하지 않습니다. 담당자 이름 아래 이어지는 업무에는 명시된 담당자를 연결합니다.

주제 제목/업무에 명시된 단어로 프로젝트 그룹을 제안하며, 연결이 불명확한 업무는 회의 후속 업무 그룹에 둡니다. 그룹명과 업무의 프로젝트 연결을 수정할 수 있고 하나의 프로젝트 또는 기존 프로젝트에 모을 수도 있습니다. 문맥에 따른 의미 분류·일정 추론·누락 없는 추출을 보장하지 않습니다. 상대/축약 일정과 조건부 배정은 확인 필요로 표시하며 담당자가 불명확한 후보는 등록 선택이 기본 해제됩니다. 접힌 후보 목록에서 내용을 열어 수정하고 추출 근거와 원문을 확인합니다.

검토 후 선택한 업무가 있는 프로젝트 그룹만 한 트랜잭션으로 생성합니다. 회의록은 한 레코드로 저장하고 projectIds로 여러 프로젝트에서 조회하며, 업무 메모에는 추출 원문과 구역을 남깁니다. 프로젝트 삭제 시 회의록의 해당 연결을 해제합니다. 실제 회사 회의록은 코드·테스트에 포함하지 않습니다.

자동 추출이 놓친 업무는 원문을 한 줄씩 다시 작성하지 않고 `누락된 업무 후보 추가`에서 보완합니다. 후보 추가/삭제 시 기존 검토 입력과 등록 선택을 보존합니다.

## 실제 저장 및 비밀번호 복구

등록된 Auth 계정을 팀원 ID에 연결한 뒤 https://he0ei.github.io/workwith/ 에서 로그인합니다. file://와 ?preview=1은 저장하지 않습니다. 최재희 계정의 실제 팀원 연결은 완료했으며 실제 로그인 후 저장/새로고침 검증은 대기 중입니다.

로그인 화면에서 복구 이메일을 요청하고 이메일 링크에서 새 비밀번호를 직접 설정합니다. 반환 토큰은 Auth 서버 확인 후 세션에 보관하며 URL에서 즉시 제거합니다. 비밀번호는 브라우저 저장소/Git에 저장하지 않습니다. Supabase Site URL과 복구 요청은 같은 Pages 주소를 사용합니다. 기본 이메일 발송은 조직 팀원 주소만 허용하고 시간당 2회 제한이 있습니다. 발송 오류는 성공으로 표시하지 않으며 SMTP 추가나 유료 서비스는 자동 설정하지 않습니다.
