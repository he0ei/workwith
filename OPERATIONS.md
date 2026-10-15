# GitHub Pages + Supabase 전환

## 전체 화면 스타일

프로젝트 칩 색상은 `src/project-colors.js`에서 현재 프로젝트 ID 집합을 정렬해 중복 없이 배정합니다. 기본 20색을 사용하고 이후에는 새 색조를 생성하므로 8색 해시/나머지 방식처럼 같은 색으로 순환하지 않습니다. 같은 프로젝트 집합에서는 화면 정렬·업무 필터·입력 배열 순서와 관계없이 같은 배정 결과를 사용합니다. 프로젝트 추가·삭제로 집합이 바뀌면 배정이 달라질 수 있으며 DB에 영구 색상을 저장하는 기능은 아닙니다. 칩 배경은 안전한 SVG 색상 속성으로 그리고, 텍스트는 어두운 색과 프로젝트명을 유지해 구분합니다.

가독성 기준은 기본 16px, 칸반 업무명 18px, 프로젝트 칩·담당자 14px, 날짜 13px입니다. 작은 화면에서도 이 크기를 유지하고 카드 폭·줄바꿈·내부 스크롤로 대응합니다. 한글 단어가 글자 단위로 잘리는 부분도 줄였습니다.

`src/toss.css`가 공통 색상·글자 위계·카드·버튼·입력창·탐색·달력·아카이브·로그인 디자인을 적용합니다. 토스 스타일을 참고한 로컬 CSS 구현이며 TDS SDK, 토스 로그인 또는 외부 폰트는 추가하지 않습니다. 기존 styles.css/atlassian.css는 구조와 이전 기능 호환을 위해 먼저 로드하며 마지막 toss.css에서 화면 전체의 표현을 통일합니다. 업무 저장·첨부·권한 로직은 변경하지 않습니다. 작은 화면의 칸반은 보드 내부에서 가로 스크롤하고 나머지 페이지가 옆으로 넘치지 않도록 구성합니다.

## 파일 미리보기와 업무 첨부

결과물의 첨부 이름/아이콘은 미리보기 팝업을 엽니다. 로그인 JWT로 파일을 가져와 이미지 또는 PDF를 표시하고, 다운로드는 팝업 버튼을 눌렀을 때만 실행합니다. PDF는 외부 뷰어 대신 고정 버전 PDF.js를 로컬 배포하여 페이지별로 렌더링합니다. 닫기/파일 전환 시 Blob URL과 PDF worker를 정리합니다. 손상되거나 암호가 필요한 PDF는 표시 오류와 다운로드 선택지를 제공합니다. 외부 URL은 기존처럼 링크로 열며, 임의 웹사이트를 팝업 안에 실행하지 않습니다.

`pnpm install --frozen-lockfile --ignore-scripts` 후 dev/build가 PDF.js 모듈·worker·폰트·CMap·WASM·라이선스를 준비합니다. `src/vendor/`는 생성 파일이므로 Git에서 제외하고, 배포에는 정적 파일로 포함합니다. CSP는 이미지 Blob 및 로컬 PDF worker를 허용하고 `object-src 'none'`은 유지합니다.

업무 첨부는 `202610150002_task_storage.sql`을 적용한 비공개 `workwith-task-files` 버킷을 사용합니다. 업무당 이미지/PDF 한 개, 5MiB 이하이며 DB에는 `attachment` 메타데이터만 기록합니다. 경로는 업로더 UUID/업무 ID/파일 UUID이고 다른 업무의 경로를 복사해 연결하는 것을 모델에서 차단합니다. Storage의 읽기·삭제는 현재 DB 업무 공개 범위와 소유자를 확인합니다. 개인 업무는 본인만 접근하며 공유→개인 변경 시 원래 업로더도 해당 업무 소유자가 아니면 접근을 잃습니다. 업로드 직후 아직 DB에 연결되지 않은 파일은 업로더만 조회·정리할 수 있습니다.

저장 충돌 시 새 파일을 정리하고 기존 파일은 보존합니다. 파일 교체·업무/프로젝트 삭제 후 기존 파일을 정리하지만 DB와 Storage는 분산 트랜잭션이 아닙니다. 특히 다른 팀원이 올린 파일을 연결 해제한 뒤에는 RLS 때문에 현재 사용자가 삭제할 수 없을 수 있습니다. 삭제 API 응답에서 파일 이름을 확인하고 삭제가 확인되지 않으면 안내를 띄웁니다. 이 경우 업로더 또는 관리자가 Storage에서 남은 경로를 정리해야 합니다. 파일 접근 권한을 넓혀 이 문제를 우회하지 않습니다.

업무 수정창은 큰 제목, 다중 담당자 칩, 상태 선택 버튼, 기본 정보/일정/결과물/설명 바로 이동, 접힌 추가 설정 및 하단 저장 버튼으로 구성합니다. Toss의 간결한 입력 경험을 참고한 로컬 UI이며 TDS 패키지는 설치하지 않습니다.

## 프로젝트 완료·대시보드·첨부 입력

프로젝트는 `status`(진행 중/완료), `priority`(높음/보통/낮음), `completedAt`을 기존 JSON payload 안에 저장합니다. 기존 레코드는 진행 중·보통으로 표시하므로 별도 SQL 데이터 이전은 필요하지 않습니다. 완료/재개는 프로젝트 상세에서 실행하며 완료일과 이력을 서버에서 기록합니다. 연결 업무·KPI·결과물은 보존하고, 미완료 업무가 남으면 프로젝트만 완료한다는 확인을 받습니다. 구형 화면의 프로젝트 수정도 저장된 상태·우선순위를 유지합니다. 이 모델이 포함된 workspace Edge Function을 프런트엔드보다 먼저 배포해야 합니다.

대시보드는 완료 전 프로젝트 최대 4개와 진행 중 업무 최대 6개를 표시합니다. 데스크톱에서는 두 패널의 폭과 높이를 맞추고 좁은 화면에서는 세로로 배치합니다. 높은 우선순위부터, 같은 순위는 마감일·제목순입니다. 프로젝트 전체 보기는 완료 프로젝트도 포함하고, 업무 전체 보기는 칸반의 진행 중 필터로 연결됩니다. 사이드바 접기 상태는 화면 이동 중 유지하며 업무 데이터를 로컬에 저장하지 않습니다.

결과물의 파란색 + 아이콘으로 등록창을 열고, 첨부 영역의 + 또는 파일 선택 버튼으로 파일을 고릅니다. 같은 영역에 파일 한 개를 드롭할 수도 있습니다. 파일명 확인 후 저장을 누르면 기존 비공개 Storage 업로드·형식/용량 검증·실패 시 정리 절차를 사용합니다. 선택/드롭만 하고 취소하면 업로드하지 않습니다.

기존 Atlassian 기반 구조 CSS 위에 공통 토스 스타일을 적용합니다. React용 Atlaskit/TDS 런타임은 사용하지 않습니다.

## 시작 전 조건

사용자 승인에 따라 `he0ei/workwith`는 공개 저장소로 변경했습니다. GitHub Pages는 Free의 공개 저장소 또는 Pro/Team 등의 비공개 저장소에서 사용할 수 있습니다. 저장소 공개는 사용자의 명시 승인 후에만 수행합니다. 회사 업무 데이터·계정 비밀번호·비밀키는 Git 저장소와 Pages 산출물에 넣지 않습니다. Pages 화면은 공개될 수 있으며 데이터 접근은 Supabase 로그인/RLS가 보호합니다.

- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

회사 내부 서비스의 GitHub 이용 정책 적합성은 별도로 확인해야 합니다. Pages는 상업 SaaS·상업 거래를 주목적으로 운영하는 무료 호스팅 용도가 제한됩니다.

## Supabase Free 프로젝트

1. https://supabase.com/dashboard 에서 사용자 계정으로 로그인합니다. 새 프로젝트 생성 시 조직 플랜이 **Free**인지 확인합니다. Pro 전환·유료 부가 기능은 선택하지 않습니다.
2. 프로젝트 URL과 publishable key를 확인합니다. publishable key는 공개 클라이언트 식별값이며 접근 통제는 Auth/RLS가 담당합니다. service_role/secret key/DB 비밀번호는 채팅·GitHub Variables·프런트엔드에 넣지 않습니다.
3. SQL Editor에서 `supabase/migrations/202610140001_workspace.sql`을 적용합니다. 빈 Supabase 프로젝트에 적용하며 다른 테이블을 초기화하거나 기존 D1 데이터를 삭제하지 않습니다. Supabase 연결 플러그인/CLI를 사용할 때도 같은 migration을 적용합니다.
4. Authentication에서 공개 사용자 가입을 비활성화합니다. 관리자 화면에서 팀원의 이메일 계정을 직접 생성하고, 아래와 같이 Auth UUID와 기존 고정 ID를 매핑합니다. 실제 비밀번호 설정은 사용자 본인이 수행합니다. 자동 초대 이메일 발송은 하지 않습니다.

```sql
insert into public.workwith_members(user_id,member_id) values
('로그인 계정의 Auth UUID','sj');
-- 필요 계정별 sj / sy / jh / ceo 중 하나를 사용합니다.
```

회원은 최대 네 고정 ID만 등록됩니다. 미등록 로그인 사용자는 DB 조회와 Edge 변경 모두 차단합니다. 고정 ID를 다른 직원에게 재배정하면 해당 ID의 개인 업무 소유권도 바뀌므로 임의 재사용하지 않습니다. 관리자 설정 코드 SETUP_TOKEN은 새 구조에서 사용하지 않습니다.

## Edge Function

정본 모델을 생성한 뒤 workspace 함수를 배포합니다.

```sh
node scripts/build-functions.mjs
supabase functions deploy workspace --project-ref 프로젝트_REF
supabase secrets set APP_ORIGIN=https://he0ei.github.io --project-ref 프로젝트_REF
```

CLI 인증정보를 명령 인자·Git 저장소·로그에 출력하지 않습니다. Supabase 연결 플러그인으로 배포하는 경우 생성된 _shared 파일들과 index.ts를 동일하게 포함합니다. SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY는 Supabase 함수 환경에서 제공하며 클라이언트에 전달하지 않습니다.

`verify_jwt=false`는 최신 publishable key와 호환하기 위한 gateway 설정입니다. handler가 모든 요청의 access token을 `/auth/v1/user`로 실제 검증하고, 관리자 DB에서 membership을 확인한 뒤에만 service_role로 변경을 계산합니다. JWT 내용을 단순 디코딩하여 사용자로 신뢰하지 않습니다. DB 변경 RPC는 service_role만 호출 가능합니다. 읽기 RPC는 authenticated + membership + RLS를 적용합니다.

## GitHub Pages 배포 전환

1. 저장소 공개 승인 및 Pages Actions 활성화는 완료했습니다.
2. 저장소 Settings → Secrets and variables → Actions → **Variables**에 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`만 설정합니다.
3. Settings → Pages → Source를 **GitHub Actions**로 지정합니다. 예상 경로는 https://he0ei.github.io/workwith/ 이지만 실제 배포 성공 전 사용 가능한 주소로 안내하지 않습니다.
4. 기존 Cloudflare Git 자동 배포를 중지한 뒤 검토 완료 PR을 main에 병합합니다. 이 PR은 wrangler 설정을 제거하므로 기존 Wrangler 빌드와 함께 운영하지 않습니다. 현재 Worker 배포와 D1 DB 자체는 삭제하지 않았습니다.
5. Pages Actions가 성공한 뒤 실제 링크에서 로그인·개인 업무 RLS·두 기기 수정 동기화·충돌을 검증합니다. 검증 전에는 기존 Cloudflare 서비스의 원격 자원을 삭제하지 않습니다.

연결 대상 Supabase 프로젝트: https://zpwqtvtbdmznbcfbhuvy.supabase.co

현재 D1 API는 configured=false여서 앱의 최초 계정 설정이 완료되지 않은 상태로 확인했습니다. D1 데이터가 실제 존재할 경우 먼저 사용자와 이전 범위를 확인하고 단일 전환 시점에 ID·이력·소유권을 보존하여 이전해야 합니다. 자동 샘플 업로드·백업 화면·데이터 초기화는 제공하지 않습니다.

## 무료 한도와 운영

Supabase Free는 DB 500MB, egress 5GB, cached egress 5GB, 파일 1GB, MAU 50,000, 활성 프로젝트 두 개를 제공합니다. 1주간 비활성 프로젝트는 일시 중지될 수 있습니다. D1 DB 하나의 무료 저장 한도도 500MB이므로 Supabase 전환 자체가 저장 용량을 늘려주지는 않습니다.

- https://supabase.com/pricing
- https://supabase.com/docs/guides/database/postgres/row-level-security

Realtime은 사용하지 않습니다. revision만 30초/60초 확인하고 변경 시에만 데이터를 받지만 전체 state 조회가 큰 경우 egress 비용/한도에 영향을 줍니다. 쌓이는 업무·이력은 측정 후 페이지 조회로 최적화합니다. 무료 플랜은 무제한 운영 보장이 아닙니다. 유료 API·유료 플랜·AI 기능은 사용하지 않습니다. 결과물 첨부는 아래 비공개 Storage 설정 후 Free 한도 안에서 사용합니다.

## 결과물 이미지·PDF 첨부

`supabase/migrations/202610150001_artifact_storage.sql`을 관리자 SQL Editor에서 검토·적용합니다. `workwith-artifacts`는 비공개 버킷이며 파일당 최대 5MiB, JPG·PNG·WebP·PDF만 허용합니다. 파일을 base64로 DB나 Git에 저장하지 않습니다. 결과물 레코드에는 버킷·경로·원래 이름·MIME·크기만 보관합니다.

등록된 팀원은 공유 결과물을 읽고 삭제할 수 있으며, 새 파일은 본인 Auth UUID 폴더에만 업로드합니다. 익명·미등록 계정은 접근할 수 없습니다. 기존 객체 덮어쓰기는 허용하지 않으며 교체 시 새 경로를 사용합니다. 다운로드는 JWT를 헤더로 보낸 인증 요청으로 처리하고 공개 URL이나 장기 서명 URL을 만들지 않습니다.

파일 저장 후 결과물 레코드 저장에 실패하면 새 업로드를 정리합니다. 교체·결과물 삭제·프로젝트 삭제 후 관련 파일 정리 실패는 화면에 안내하므로 운영자가 Storage에서 미참조 파일을 확인해야 합니다. DB와 Storage 간 분산 트랜잭션은 제공하지 않습니다. 실제 회사 파일을 정리할 때는 결과물 레코드의 참조 여부를 확인하세요.

Storage Free 총 1GB와 전송량 한도는 별도입니다. 초과·권한·설정 오류는 업로드 실패로 표시하며 유료 플랜 전환이나 결제 설정을 실행하지 않습니다. 업로드를 사용하려면 수정된 workspace Edge Function도 배포해야 합니다. 함수 파일은 기존 build-functions.mjs로 생성합니다.

## 검증 필요 항목

호스팅 정책/계정 연결 후 실제 Supabase에서 Auth 로그인, 외부 회원 차단, anonymous REST 차단, 타인의 private 레코드 직접 SELECT 및 수정 차단, Edge JWT/CORS, DB 트랜잭션, 세션 갱신, Pages 경로의 CSS/JS 로딩, 실제 두 컴퓨터의 수정 반영과 충돌을 확인해야 합니다. 로컬 PGlite PostgreSQL 검증은 실제 Supabase 배포 확인을 대체하지 않습니다.

## 적용 결과

지정된 Free 프로젝트에 SQL 스키마와 RLS를 적용하고 workspace 함수를 배포했습니다. 대시보드 배포용 dashboard.ts는 build-functions.mjs에서 정본 모델·서버 handler를 합쳐 생성하며 Pages origin을 https://he0ei.github.io로 한정합니다. 별도의 APP_ORIGIN Secret 등록 없이 같은 검증을 수행합니다. CLI의 여러 파일 배포 방식은 위 환경변수 설정을 사용합니다.

## 비밀번호 복구

Authentication → URL Configuration의 Site URL은 https://he0ei.github.io/workwith/ 입니다. 로그인 화면에서 등록 이메일로 복구 링크를 요청합니다. 앱은 URL fragment를 제거한 뒤 Auth에서 토큰을 검증하고 비밀번호 변경 폼을 표시합니다. 새 비밀번호 입력·제출은 본인이 수행합니다. 기본 SMTP는 조직 팀원 주소만 발송 가능하고 시간당 2회 제한입니다. 다른 주소에는 별도 SMTP 구성이 필요하며 유료 서비스는 승인 없이 연결하지 않습니다. 실제 비밀번호와 복구 링크는 로그·Git·채팅에 보관하지 않습니다.

실제 공개 URL/키를 GitHub Variables에 등록했고 미로그인 API 401을 확인했습니다. Cloudflare의 운영/미리보기 Git 빌드를 중지했습니다. 기존 운영 자원을 삭제하지 않았으며 Pages 성공 배포와 사용자 계정 검증은 아직 필요합니다.
