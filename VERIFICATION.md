# Supabase / GitHub Pages 전환 검증

2026-10-14 기준 로컬 준비 결과:

- Node.js 24, PGlite 0.5.9(PostgreSQL) 테스트 전용 의존성 설치.
- `node --test tests/*.test.mjs`: 44 pass, 0 fail.
- 구성: 모델 19, UI 부모/하위 8, PostgreSQL 부모/하위 10, Edge Auth 경계 2, Supabase 저장 계층 5.
- PostgreSQL에서 migration 실행·실제 역할별 RLS 적용·anon 권한 차단·비회원 차단·authenticated 직접 쓰기 차단·service 전용 commit·CAS·병렬 변경·SQL 제약 실패의 전체 롤백 확인.
- UI에서는 기존 CRUD/KPI/결과물/회의록·숨겨진 탭 폴링 중단·열린 폼 보존·stale version 충돌 시 입력 유지 확인. UI 테스트에 저장 계층을 주입하며 실제 PostgreSQL repository를 호출함.
- Auth 저장 계층: 이메일 로그인 REST 경로·세션 토큰만 보관·만료 갱신 single flight·네트워크 실패·409 전달·브라우저 fetch receiver 검증.
- Edge handler: Supabase Auth 사용자 검증 후 DB 접근, 클라이언트 actor 무시, 미등록 사용자·잘못된 JWT·허용되지 않은 origin 차단.
- 정적 빌드와 생성된 Edge shared 모듈 구문 확인. 프런트엔드 산출물에는 서버 코드·PGlite·비밀정보를 포함하지 않음.

아래 실제 서비스 준비 확인은 PR #7 이후 상태를 기록합니다. 로컬 테스트는 실제 회사 데이터를 사용하지 않습니다.

## 실제 서비스 준비 확인

- 사용자 브라우저 로그인 후 Supabase 조직의 FREE 요금제와 Healthy 프로젝트 확인.
- 실제 SQL Editor에서 migration 적용 성공. workwith_members/workwith_records/workwith_workspace의 RLS=true 확인.
- workspace Edge Function 배포 성공. 함수 내부에서 Auth 서버 검증을 수행하며 legacy-only JWT 검증은 비활성화하여 최신 JWT와 호환.
- 실제 공개 키 요청: DB snapshot RPC는 401 permission denied, 미로그인 Edge 변경은 401 로그인 필요 응답.
- GitHub Actions에 실제 SUPABASE_URL과 공개 publishable key 변수 등록. 비밀키는 등록하지 않음.
- Cloudflare 운영·미리보기 자동 Git 빌드 중지 설정. 기존 Worker/D1 원격 데이터는 삭제하지 않음.
- PR #7 병합과 GitHub Pages 배포 완료. 실제 팀원 Auth 계정/UUID 매핑과 두 컴퓨터의 동기화 검증은 미완료.

Supabase 공개 신규 가입을 비활성화했고 이메일 인증 설정은 유지했다. 사용자 계정은 관리자 등록 방식만 사용한다.

## Atlassian 디자인 변경

- 의미별 색상·8px 간격·작은 모서리·상태 배지·선택 표시·입력 포커스·모바일 배치 적용.
- 대시보드 핵심 지표와 프로젝트 업무 완료 수/진행 막대 강조. 담당자별 업무량 영역과 모아 명칭 제거. 프로젝트·이번 주 업무 2열 및 전체 너비 KPI로 재배치. KPI 계산 방식은 변경 없음.
- 로그인 없는 빈 미리보기에서 보호된 저장소를 조회하지 않고 폴링·쓰기 차단하는 회귀 테스트 추가.
- 실제 브라우저에서 데스크톱 대시보드/협업 보드 및 모바일 대시보드/업무 입력 폼 확인. 모바일 body 가로 넘침 없음.
- 미리보기 저장 시 오류 안내와 폼 유지 확인. 로그인 설정 작업은 사용자 요청으로 잠시 중단.

최종 검증: 자동 테스트 45개 통과(실패·누락 0), Supabase 공개 설정을 적용한 정적 빌드 성공. 데스크톱과 모바일에서 수정된 대시보드 확인. 이 디자인 변경은 PR 병합 후 Pages에 배포됩니다.
