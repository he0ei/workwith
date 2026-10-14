# D1 전환 검증 · 2026-10-14

## 실행 결과

- Node.js 24.19.0, 외부 패키지 추가 없음.
- `node --test tests/*.test.mjs`: 40 pass, 0 fail (모델 19, UI 부모/하위 8, Worker API 12, 저장 계층 1).
- `node scripts/build.mjs`: 정적 dist 빌드 성공. Worker 코드는 별도 main으로 배포.
- 브라우저 API 호출의 fetch binding 오류를 발견·수정하고 회귀 테스트 추가.
- 로컬 브라우저에서 기존 테스트 계정 로그인 → 공유 업무 생성 → 페이지 새로고침 → 협업 보드에서 같은 업무 유지 확인.
- 로컬 테스트용 계정과 업무는 `.wrangler/local/` 개발 DB에만 있었으며 검증 후 제거. 운영 DB와 GitHub에 업로드하지 않음.
- 실제 Cloudflare Workers Free 계정에서 `workwith-db` 생성. Console SQL 성공 및 workspace/records/users/sessions/login_attempts 테이블 목록 확인.

## 검증 범위

인증 없는 요청, 잘못된 로그인, 세션 만료·로그아웃, 로그인 시도 제한, 최초 네 계정 일괄 설정·재설정 차단, 서버의 개인 업무·이력 필터, 타인 private ID 직접 수정 거부, 서로 다른 카드의 실제 병렬 요청, 같은 카드 stale version 충돌, 연쇄 삭제 stale revision, 회의록 원자적 등록, SQL 실패 전체 롤백, SQL 연결 재시작 후 데이터 유지, CORS 제한, DB 미연결 시 차단을 테스트했다.

UI는 실제 API와 SQLite 어댑터를 사용하여 CRUD·전체 화면·KPI·결과물·회의록 등록·폴링 중 편집 폼 유지·충돌 시 입력 유지·숨겨진 탭의 폴링 중단을 검증했다. localStorage 접근 시 테스트가 실패하도록 설정했다.

## 현재 한계

Worker API의 SQL 테스트는 D1에서 쓰는 API를 Node SQLite로 재현한 로컬 통합 검증이다. 실제 Cloudflare에는 DB와 스키마만 준비되어 있으며, 운영 Worker API 배포·계정 비밀번호 설정·실제 다중 컴퓨터의 동기화와 권한 검증은 아직 수행하지 않았다. 배포 이후 crypto CPU/무료 제한·D1 batch를 확인해야 한다.

현재 프런트엔드는 기존 Workers 주소로 배포하는 구성이다. GitHub Pages 별도 배포는 미수행. 기존 브라우저 시연 데이터의 자동 이전·백업·샘플 불러오기 없음. 유료 서비스·AI·R2 저장 호출 없음.
