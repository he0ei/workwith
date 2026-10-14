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

실제 Supabase 프로젝트/계정 연결, SQL 적용, Edge 배포, GitHub Pages 실제 배포, 실제 여러 컴퓨터의 동기화는 아직 미수행이다. 기존 Cloudflare 운영 Worker/D1 DB는 변경·삭제하지 않았다. 사용자 승인으로 저장소 공개와 Pages Actions 설정을 완료했다. Supabase URL 변수도 준비했으며 공개 키·실제 프로젝트 접근 연결은 대기 중이다.

빌드 추가 검증: 공개 키로 프로젝트 한정 CSP·정적 산출물 확인. sb_secret 형태의 키는 의도대로 빌드에서 거부됨. 실제 프로젝트 공개 키는 아직 미등록이며 마지막 로컬 산출물은 미연결 상태로 다시 생성함.
