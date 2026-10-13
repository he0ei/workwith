# 실제 사내 운영 전환 계획

현재 로컬 MVP는 P0~P2의 시연 범위를 구현했습니다. 이 문서는 **후속 설계이며 실제 Supabase 설정·RLS 코드·배포가 아닙니다**. 인증 연결 없이 회사 자료를 입력하거나 시연 사용자 전환을 보안 장치로 사용하지 마세요.

## 무료 정책 확인 (2026-10-13)

| 후보 | 공식 확인 내용 | 적용 판단 |
|---|---|---|
| GitHub Pages | 공개 저장소는 GitHub Free 사용 가능. 비공개 저장소 Pages는 Pro/Team 등 대상. 상업 거래·상업 SaaS 중심 운영에 제한, 민감한 거래에 부적합. 사이트 최대 1GB, soft bandwidth 100GB/월 | 정적 기술 호환은 가능하나 사내 인증 앱 운영 적합성을 확정하지 않음. 실제 배포 전에 GitHub 문의 또는 다른 호스트의 정책·접근 제어 검토 |
| Supabase Free | DB 500MB, MAU 50,000, egress 5GB 및 cached egress 5GB, 파일 1GB, 활성 프로젝트 2개, 1주 비활성 시 일시 중지. Pro는 월 $25부터이며 추가 요금 항목 존재 | 4명 MVP의 후보. 무료 한도와 장애/일시중지·수동 백업 대응을 검토 후 연결. 유료 전환·추가 서비스 구매 미수행 |
| Cloudflare R2 Standard | 월 10GB-month, Class A 100만, Class B 1,000만 무료. 초과 사용량은 요금 대상. Infrequent Access는 해당 무료 대상 아님 | 첨부 파일 필요가 확인될 때 도입. 링크 저장 단계에서는 사용하지 않음 |

근거:

- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
- https://github.com/github/docs/blob/main/content/site-policy/github-terms/github-terms-for-additional-products-and-features.md
- https://supabase.com/pricing
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://developers.cloudflare.com/r2/pricing/

가격·정책은 연결 직전에 다시 확인해야 합니다. 회사 내부 서비스에 GitHub Pages가 허용된다는 보장은 하지 않습니다. 인증을 Supabase로 분리하더라도 Pages 적합성을 별도로 검토해야 합니다. 공개 소스는 합성 예시만 포함해야 합니다.

## DB와 인증

현재 배열 구조를 다음 관계형 테이블로 옮깁니다. 실제 사용자 ID는 문자열 시연 ID 대신 Supabase Auth UUID입니다.

| 테이블 | 주요 필드 | 관계 / 공개 범위 |
|---|---|---|
| organizations | id, name | 사내 조직 |
| members | organization_id, user_id, display_name, role | 서버 관리자가 4명만 등록. 사용자가 스스로 가입/권한 변경 불가 |
| projects | id, organization_id, title, goal, owner_id, start_date, due_date, revision | 조직 공유 |
| tasks | id, organization_id, owner_id, assignee_id, project_id nullable, visibility, title, note, status, priority, planned_date, due_date, estimated_hours, completed_at, kpi_id nullable, result_url, revision | private는 owner_id만. shared는 같은 조직 멤버 |
| task_dependencies | task_id, prerequisite_task_id | 부모 업무 권한 상속. 공유 업무는 개인 선행 업무 참조 금지 |
| kpis | id, project_id, title, target, current, unit, calculation_method | 프로젝트 조직 권한 상속 |
| artifacts | id, project_id, title, url | 프로젝트 조직 권한 상속. URL 대상 권한은 별도 관리 |
| minutes | id, organization_id, project_id nullable, title, body, author_id, created_at | 조직 공유 |
| change_events | id, organization_id, entity_id, entity_type, visibility, owner_id, before, after, reason, actor_id, created_at | 원본과 같은 공개 범위. DB 트리거가 기록 |

최소 보안 조건:

1. 초대된 4명만 Auth 로그인과 활성 members 레코드를 부여합니다. 공개 신규 가입을 끄고 탈퇴/퇴사 계정은 즉시 비활성화합니다.
2. API에서 노출하는 모든 테이블에 RLS를 활성화합니다. `anon`은 접근 불가, `authenticated`도 members 확인 후 같은 조직 데이터만 접근합니다.
3. 개인 업무는 대표 계정도 타인의 것을 읽을 수 없도록 기본 정책을 정합니다. 업무 소유자는 생성 시 `auth.uid()`로 고정하고 수정 불가입니다. 개인 업무의 담당자=소유자, project_id=NULL 조건을 DB에서도 강제합니다.
4. 조직 공유 업무는 같은 조직의 활성 멤버가 편집할 수 있는 현재 시연 정책을 우선 사용합니다. 대표/담당자만 수정해야 한다면 실제 운영 전에 역할 정책을 조정합니다.
5. SELECT만 제한하지 않고 INSERT/UPDATE의 WITH CHECK, DELETE까지 보호합니다. 업무·프로젝트·담당자·KPI·선행 업무의 조직 일치를 FK/제약/RPC로 강제합니다.
6. members 쓰기는 서버 관리자만 가능합니다. 앱 클라이언트의 역할 또는 조직 ID 값을 신뢰하지 않습니다. RPC의 SECURITY DEFINER 사용 시 고정 search_path와 최소 권한을 적용합니다.
7. 일정 변경은 사유와 변경 전/후 값, actor, 서버 시각을 DB 트리거 또는 트랜잭션 RPC에 기록합니다. 클라이언트가 감사 로그를 수정/삭제할 수 없게 합니다. 사용자별 개인 변경 이력도 소유자만 조회합니다.
8. 업무 완료, 의존 관계 순환 검사, 일정 수정, 회의록+업무+KPI 등록은 DB 트랜잭션으로 처리합니다. revision 조건으로 동시 수정 충돌을 사용자에게 알립니다.
9. 공개 프런트엔드에는 **service_role, secret key, DB 비밀번호**를 넣지 않습니다. Supabase의 공개 publishable key는 Auth+RLS 적용 전 운영 연결에 사용하지 않습니다. 현재 앱에는 키가 전혀 없습니다. 호스트 환경변수도 정적 번들에 포함될 수 있으므로 비밀 저장 수단으로 취급하지 않습니다.
10. 연결 시 현재 CSP의 `connect-src 'none'`을 필요한 Supabase 호스트만 허용하는 정책으로 변경합니다. `*`로 풀지 않습니다. 현재 상태는 외부 API 요청을 브라우저 CSP에서 차단합니다.

## 실제 검증 완료 조건

실제 연결이 없으므로 아래 항목은 모두 미검증입니다. 로컬 시연 테스트 통과와 혼동하지 않습니다.

- 로그인 없는 요청으로 모든 테이블 읽기·쓰기 차단.
- 같은 조직 4명 각각 공유 업무 조회·수정·재접속 확인.
- A의 개인 업무와 메모, 개인 변경 이력을 B/C/D가 REST·직접 쿼리·Realtime에서 조회/수정/삭제할 수 없는지 검증.
- 존재하지 않는 조직, 다른 조직 UUID, 타인 owner_id로 삽입·수정, 탈퇴 멤버 접근 차단.
- 연결된 KPI·결과물·의존 관계로 조직/개인 데이터가 누출되지 않는지 검증.
- 두 브라우저/기기에서 동기화, 동시 수정 충돌, 연결 끊김/재연결 동작 확인.
- 데이터 삭제·복구, DB 백업 내보내기와 실제 복원 시험. Free를 영구 백업 보장으로 취급하지 않음.
- 4개 화면 폭(375/768/1280/1440)에서 입력 폼, 캘린더 스크롤, 칸반, 키보드 탐색 검증.
- 무료 한도 알림·일시 중지 복구 절차 확인. 유료 플랜 전환과 AI 호출은 별도 사용자 승인 후에만 활성화.

## 진행 순서

1. 로컬 화면을 실제 브라우저에서 시연하고 역할별 편집 정책을 확정합니다.
2. 승인된 회사 계정의 Supabase Free 프로젝트를 만들고 회원·DB 제약·RLS부터 구성합니다.
3. 데이터 저장 계층을 연결합니다. 로컬 데모와 운영 데이터를 분리하며 데모 데이터의 자동 업로드는 하지 않습니다.
4. 위 권한·동기화·백업 시나리오를 검증한 다음 정책에 맞는 호스트에 배포합니다.
5. 실제 첨부 파일이 필요해지면 별도의 private storage를 도입합니다. 파일 크기/타입/소유권 검증, 만료 서명 URL, 요금 한도를 설정합니다.
6. 자연어 AI는 현재 규칙 파서 인터페이스 뒤의 선택 기능으로 추가합니다. 기본 비활성, 데이터 전달 범위·비용·API 키의 서버 저장을 먼저 결정합니다.
