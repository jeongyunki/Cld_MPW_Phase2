# MPW Plus 2차 개발 실행계획 (Execution Plan)

> 작성 단계: 실행계획. `docs/1-domain-definition.md` ~ `docs/6-erd.md`, `database/schema.sql`에서 이미 확정된 내용(기술 스택, 기능 범위, 인증/동시성 방향, 스키마)을 그대로 전제로 삼는다. 이 문서는 그 결정들을 재논의하지 않고, "실제로 무엇을 어떤 순서로 만들 것인가"만 데이터베이스/백엔드/프론트엔드 세 영역으로 나눠 관리 가능한 Task 단위로 분해한다.
>
> 데이터베이스(`postgres-pro`), 백엔드(`backend-developer`), 프론트엔드(`frontend-developer`) 세 전문 서브에이전트가 병렬로 각자 영역을 분해했고, Task ID 접두사(`DB-`/`BE-`/`FE-`)를 공통 체계로 맞춰 이 문서에서 교차 의존성을 연결했다.

---

## 전체 Task 한눈에 보기

| ID | 영역 | Task | 의존성 |
|---|---|---|---|
| DB-1 | DB | Knex 설치 + `knexfile.js` + `connection.js` | 없음 (시작점) |
| DB-2 | DB | `schema.sql` → Knex migration 변환 | DB-1 |
| DB-3 | DB | `master_items` 초기 시드 스크립트 | DB-1, DB-2 |
| DB-4 | DB | 로컬 PostgreSQL 기동 + 검증 + 셋업 문서화 | DB-1, DB-2, DB-3 |
| BE-1 | 백엔드 | Express 앱 골격 (+ `/api/health`) | DB-1 |
| BE-2 | 백엔드 | 인증 자체 구현 (Passport.js Local + 세션) | DB-2, BE-1 |
| BE-3 | 백엔드 | master-items API | DB-2, DB-3, BE-1, BE-2 |
| BE-4 | 백엔드 | deliverables API (파일 업/다운로드) | DB-2, BE-1, BE-2 |
| BE-5 | 백엔드 | imgagong-plans API (낙관적 잠금) | DB-2, BE-1, BE-2 |
| BE-6 | 백엔드 | 임가공 의뢰 일괄확정 + SSE | BE-5 |
| BE-7 | 백엔드 | 백엔드 통합 점검 | BE-1~BE-6 |
| FE-1 | 프론트 | API 클라이언트 계층 구축 | (BE-1 헬스체크 정도만 있으면 검증 가능, 구조 자체는 즉시 착수) |
| FE-2 | 프론트 | 로그인 화면 + 인증 상태 관리 | FE-1 / BE-2 |
| FE-3 | 프론트 | Master Page 백엔드 연동 | FE-1, FE-2 / BE-3 |
| FE-4 | 프론트 | Deliverables Page 신규 라우트 | FE-1 / BE-4 |
| FE-5 | 프론트 | MapGen "Excel 파일 선택" 입력 추가 | FE-4 / BE-4 |
| FE-6A | 프론트 | 임가공 Plan 백엔드 연동 (CRUD+기간필터) | FE-1, FE-2 / BE-5 |
| FE-6B | 프론트 | 임가공 Plan 실시간공유 + 의뢰확정 UI | FE-6A / BE-6 |
| FE-7 | 프론트 | 프론트엔드 통합 점검 | FE-1~FE-6B 전체 / BE-7 |

**권장 착수 순서(단계별 병렬 가능 구간)**
1. DB-1 → BE-1과 FE-1을 동시 착수 가능 (BE-1은 DB-1만 있으면 됨, FE-1은 프론트 내부 구조라 독립적)
2. DB-2~DB-4 진행과 병행해 BE-2(인증)까지는 준비 가능(단, 실제 검증은 DB-4 이후)
3. DB-4 완료 → BE-2~BE-6을 순서대로, FE-2(로그인 화면 골격)는 병행 가능
4. BE-2 완료 → FE-2 실제 연동 가능 → BE-3/4/5 각각 완료되는 대로 FE-3/4/6A 순차 연동
5. BE-6 완료 → FE-6B, FE-4 완료 → FE-5
6. BE-7, FE-7 (전체 통합 점검, 병렬 불가 — 마지막)

---

## 데이터베이스 영역

DB-1~DB-4는 선형 의존관계(DB-1 → DB-2 → DB-3 → DB-4)이며, 백엔드/프론트엔드 영역은 **DB-4(전체 검증 완료)** 시점부터 실제 DB에 의존하는 작업을 시작할 수 있다.

### DB-1: Knex 설치 + `knexfile.js` + `connection.js` 작성

**목표/범위**: `server/` 디렉토리에 Knex와 `pg` 드라이버를 설치하고, dev/production 환경을 분기하는 `knexfile.js`와 이를 바탕으로 Knex 인스턴스를 만들어 export하는 `server/src/db/connection.js`를 작성한다. 이후 모든 백엔드 리소스 모듈이 DB에 접근하는 유일한 진입점을 만드는 것이 목적이다.

**완료 조건**
- [x] `server/package.json`에 `knex`, `pg`가 의존성으로 추가되고, `server` 디렉토리에서 `pnpm install`이 에러 없이 끝난다.
- [x] `server/knexfile.js`에 `development`/`production` 두 블록이 있고, 각각 `client: 'pg'`, `connection: process.env.DATABASE_URL`, `pool: { min, max }`(환경변수로 오버라이드 가능, 기본값 예: `min:2, max:10`, PRD 6절 "규모 재검토" 반영)가 채워져 있다.
- [x] `server/src/db/connection.js`가 `knexfile.js`를 읽어 `NODE_ENV` 기준으로 Knex 인스턴스 하나를 생성해 export한다.
- [x] `server/.env.example`에 `DATABASE_URL`, `DB_POOL_MIN`, `DB_POOL_MAX` 키가 추가된다.
- [x] `npx knex --help`(또는 `node -e "require('./knexfile.js')"`)가 문법 에러 없이 실행된다(실제 PostgreSQL 연결 검증은 DB-4에서).

**의존성**: 없음 (DB 영역의 시작점)

**이 Task가 제공하는 것**: `server/knexfile.js`, `server/src/db/connection.js` — 이후 모든 `*.repository.js`가 `require('../db/connection')` 한 줄로 DB 접근 가능.

**참고 근거**: PRD 6절 "규모 재검토"(pool 튜닝), `4-project-structure-principles.md` 5.1절(환경변수 원칙)·6.2절(디렉토리 구조)

---

### DB-2: `database/schema.sql` → Knex migration 파일 변환

**목표/범위**: 이미 검토 완료된 `database/schema.sql`의 DDL(4개 테이블, extension, index, 트리거)을 `server/src/db/migrations/`의 Knex migration 파일로 옮긴다. 스키마를 다시 설계하지 않고 그대로 이관한다.

**완료 조건**
- [x] `npx knex migrate:make create_initial_schema`로 생성한 migration 파일 **하나**가 `server/src/db/migrations/`에 있다(초기 1회 적용이므로 테이블별로 쪼개지 않는다).
- [x] `up()`에서 `pgcrypto` extension 생성과 `users`/`deliverables`/`imgagong_plans`/`master_items` 4개 테이블의 컬럼/타입/제약(PK, `users.email` UNIQUE, FK 2개, NOT NULL, DEFAULT)이 `schema.sql`과 1:1 대조 기준으로 빠짐없이 반영된다.
- [x] `schema.sql`의 인덱스 3개(`idx_deliverables_mpw_round_process_name`, `idx_imgagong_plans_created_at`, `idx_master_items_field_name`)가 모두 생성된다.
- [x] `updated_at` 자동 갱신 트리거(`schema.sql` 참고용) 포함 여부를 이 Task에서 최종 결정하고 반영(포함 시 raw SQL로, 제외 시 이유를 migration 파일 주석에 남김).
- [x] `down()`이 `up()`을 역순(트리거/함수 → 테이블 → extension)으로 되돌린다(왕복 실행 검증은 DB-4).

**의존성**: DB-1

**이 Task가 제공하는 것**: `server/src/db/migrations/*_create_initial_schema.js` — 확정된 테이블/컬럼명이 이후 백엔드 repository가 쿼리할 대상이 됨.

**참고 근거**: `database/schema.sql` 전체, `docs/6-erd.md`, PRD 3.5절

---

### DB-3: `master_items` 초기 시드 스크립트

**목표/범위**: `server/src/db/seeds/`에 `master_items`의 초기 dropdown 데이터를 넣는 시드 스크립트를 작성한다.

**완료 조건**
- [x] `npx knex seed:make 01_master_items`로 생성한 파일이 `server/src/db/seeds/`에 있다.
- [x] `field_name`(status/category/assembler/chip_size/pkg_type) × `item_name` × `sort_order` 조합으로 총 **20행**이 삽입된다. 값은 **현재 코드 `src/lib/masterStore.svelte.js`의 실제 초기값**을 기준으로 한다(status 4개 — `new`/`checked`/`approved`/`requested`, 구분 5개, 조립처 5개, Chip size 3개, PKG Type 3개). `requested`(의뢰 확정)는 FR-IM-06 결정에 따라 실행계획 단계에서 코드에 추가됨.
- [x] `sort_order`는 `masterStore.svelte.js`의 배열 순서(index)를 그대로 반영한다.
- [x] seed는 재실행해도 중복 삽입되지 않는다(`del()` 후 insert하는 초기화 방식).

**의존성**: DB-1, DB-2

**이 Task가 제공하는 것**: `server/src/db/seeds/01_master_items.js` — 로컬 개발 시 Master Page/임가공 Plan dropdown이 빈 화면이 아니라 바로 동작.

**참고 근거**: `src/lib/masterStore.svelte.js`(실제 최신 초기값, 검증 완료), PRD 부록, `4-project-structure-principles.md` 6.2절

---

### DB-4: 로컬 PostgreSQL 기동 + migration/seed 적용 검증 + 셋업 문서화

**목표/범위**: 로컬에 실제 PostgreSQL을 띄우고 DB-1~DB-3의 산출물이 처음부터 끝까지 에러 없이 적용되는지 검증한 뒤, 재현 가능한 최소 셋업 절차를 문서화한다.

**완료 조건**
- [x] 로컬 PostgreSQL이 기동되어 있고(설치형 또는 Docker), 이를 가리키는 `DATABASE_URL`로 `server/.env`가 작성되어 있다.
- [x] `npx knex migrate:latest`가 에러 없이 끝나고, 4개 테이블이 실제로 생성된 것을 확인한다.
- [x] `npx knex seed:run`이 에러 없이 끝나고, `SELECT COUNT(*) FROM master_items;` 결과가 20과 일치한다.
- [x] `npx knex migrate:rollback` 후 다시 `migrate:latest`를 실행해도 에러 없이 끝난다.
- [x] PostgreSQL 설치/기동부터 `migrate:latest`/`seed:run`까지의 명령어 순서를 문서(README 또는 `docs/` 하위)로 남긴다.

**의존성**: DB-1, DB-2, DB-3

**이 Task가 제공하는 것**: 실제 동작이 검증된 로컬 PostgreSQL 환경 — 이후 BE-1(Express 골격) 이후의 모든 백엔드 Task가 "DB는 준비돼 있다"는 전제로 시작 가능해짐.

**참고 근거**: PRD 8절 Phase 1, `4-project-structure-principles.md` 6.2절

---

## 백엔드 영역

리소스 경계(master-items/deliverables/imgagong-plans/인증/SSE)는 ERD의 리소스 4개(users는 인증에 흡수) + PRD 8절 로드맵과 대응한다. 리소스마다 파일처리·낙관적 잠금·권한 등 서로 다른 업무 규칙이 있어 이 이상 합치지 않았고, CRUD 세부 동작(조회/쓰기)으로 더 쪼개지도 않았다(오버엔지니어링 금지 원칙).

### BE-1: Express 앱 골격

**목표/범위**: Express 앱을 조립하고(`app.js`/`server.js`), 공통 미들웨어(JSON 파싱, CORS, 요청 로깅)와 표준 에러 응답 포맷(`errorHandler.js`)을 갖춘다.

**완료 조건**
- [x] `server/src/app.js`에서 Express 인스턴스 생성, `express.json()`, CORS(프론트 dev 서버 origin 허용), `morgan` 요청 로깅 등록
- [x] `server/src/middleware/errorHandler.js`가 모든 미처리 에러를 `{ error: { message } }` 형태로 통일 응답
- [x] `server/src/server.js`가 `.env`의 `PORT`로 HTTP 서버 기동
- [x] `GET /api/health`가 Knex 연결로 `SELECT 1` 실행 후 200 `{ status: "ok" }`, 실패 시 500 반환
- [x] 존재하지 않는 경로 요청 시 404 JSON 반환
- [x] **프론트 확인 방법**: `curl http://localhost:<PORT>/api/health` → `{"status":"ok"}`

**의존성**: DB-1

**참고 근거**: PRD 6절, PRD 8절 Phase 1, `4-project-structure-principles.md` 2절·6.2절

---

### BE-2: 인증 자체 구현 (Passport.js Local + 세션)

**목표/범위**: 이메일+비밀번호 기반 세션 로그인을 구현하고, `requireAuth`/`requireAdmin` 미들웨어를 `middleware/auth.js` 한 곳에 격리해 이후 리소스 Task들이 재사용하도록 한다.

**완료 조건**
- [x] `passport`, `passport-local`, `express-session`, `bcryptjs` 설치 및 설정
- [x] `middleware/auth.js`에 Local Strategy 구현: `users.email` + `password_hash`(bcryptjs) 검증
- [x] `express-session` 등록, 세션 타임아웃 30분(PRD 4.4절)
- [x] `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` 라우트 구현
- [x] `requireAuth`, `requireAdmin` 미들웨어를 `auth.js`에서 export
- [x] 회원가입 화면은 만들지 않고, 관리자 계정 1개를 seed 스크립트로 생성
- [x] **프론트 확인 방법**: 올바른 자격증명으로 `POST /api/auth/login` → 200 + 세션 쿠키, 그 쿠키로 `GET /api/auth/me` → 사용자 정보. 틀린 비번은 401.

**의존성**: DB-2, BE-1

**참고 근거**: PRD 5절(1단계 자체 구현), PRD 4.3/4.4절, `docs/6-erd.md` users 테이블, `4-project-structure-principles.md` 1절 5항

---

### BE-3: master-items API

**목표/범위**: Master Page의 dropdown 항목 CRUD(FR-MS-01~03) 구현.

**완료 조건**
- [x] `GET /api/master-items`, `POST /api/master-items`, `DELETE /api/master-items/:id`를 routes→controller→service→repository 4단으로 구현
- [x] `GET`은 `requireAuth`, `POST`/`DELETE`는 `requireAdmin` 적용
- [x] `field_name`이 5개 허용값이 아니거나 `item_name`이 빈 문자열이면 400
- [x] FR-MS-03: 삭제 시 해당 값을 사용 중인 `imgagong_plans` 행 개수를 응답에 포함(삭제 자체는 막지 않음)
- [x] **프론트 확인 방법**: 로그인 세션으로 `GET /api/master-items` → 필드별 배열 JSON, 관리자 세션으로 `POST` 후 `GET`에 반영 확인

**의존성**: DB-2, DB-3, BE-1, BE-2

**참고 근거**: PRD FR-MS-01~03, PRD 4.3절, `docs/6-erd.md` master_items

---

### BE-4: deliverables API (파일 업로드/다운로드 포함)

**목표/범위**: Deliverables 등록/조회/다운로드/삭제(FR-DL-01~04)와 엑셀 파일의 로컬 저장/서빙 구현.

**완료 조건**
- [x] `POST /api/deliverables`(multipart/form-data, `multer`) — `lib/upload.js`가 저장 경로(`uploads/deliverables/{id}.{xlsx|xls}`)와 10MB 초과 시 400 처리
- [x] `GET /api/deliverables` — 페이지네이션, 차수/공정명 검색, 최신순 정렬
- [x] `GET /api/deliverables/:id/download` — 파일 스트리밍 응답(`/uploads` URL 직접 노출 금지)
- [x] `DELETE /api/deliverables/:id` — 등록자 본인 또는 관리자만 가능
- [x] `mpw_round`/`process_name` 미입력 시 400, 모든 엔드포인트 `requireAuth`
- [x] **프론트 확인 방법**: 파일+필드 등록 → 201, `GET` 목록에 표시, `download`로 원본 파일 그대로 다운로드

**의존성**: DB-2, BE-1, BE-2

**참고 근거**: PRD FR-DL-01~04, PRD 6절(파일 저장소/다운로드 엔드포인트), `docs/6-erd.md` deliverables

---

### BE-5: imgagong-plans API (낙관적 잠금 포함)

**목표/범위**: 임가공 Plan 생성/조회(기간 필터)/편집/삭제(FR-IM-01~04), PATCH에 낙관적 잠금 적용.

**완료 조건**
- [ ] `POST /api/imgagong-plans` — 필수 필드 검증 후 생성, `status`는 항상 서버가 `'new'`로 고정
- [ ] `GET /api/imgagong-plans` — 기간 필터(`created_at` 범위), 페이지네이션, 최신순
- [ ] `PATCH /api/imgagong-plans/:id` — body에 `version` 필수, DB 현재 값과 다르면 409, 성공 시 `version+1`/`updated_at`/`updated_by` 갱신
- [ ] `DELETE /api/imgagong-plans/:id` — `owner`가 본인이거나 관리자일 때만 허용
- [ ] 낙관적 잠금 버전 비교 로직을 `req`/`res` 없는 순수 함수로 분리, 여기에만 최소 단위 테스트 1~2개
- [ ] 모든 엔드포인트 `requireAuth`
- [ ] **프론트 확인 방법**: 같은 id를 오래된 `version`으로 두 번 PATCH → 두 번째 요청 409

**의존성**: DB-2, BE-1, BE-2

**참고 근거**: PRD FR-IM-01~04, PRD 4.2절, `docs/6-erd.md` imgagong_plans, `4-project-structure-principles.md` 4절

---

### BE-6: 임가공 의뢰 일괄확정 + SSE 실시간 브로드캐스트

**목표/범위**: 선택된 여러 행을 한 번에 확정 상태로 변경하는 API(FR-IM-06)와, 변경 사항을 실시간 전파하는 SSE 채널(FR-IM-05) 구현.

**완료 조건**
- [ ] `PATCH /api/imgagong-plans/bulk-confirm`(id 배열 입력, `requireAdmin`)
- [ ] 의뢰 확정 상태값 `'requested'`를 상수로 정의해 사용(DB-3 시드에 이미 포함되어 별도 사전 등록 불필요, PRD FR-IM-06 참조)
- [ ] `lib/sse.js` — `GET /api/imgagong-plans/stream`이 커넥션을 메모리에서 관리, 연결 종료 시 제거
- [ ] BE-5의 생성/수정/삭제와 이 Task의 일괄확정 성공 시 broadcast 호출
- [ ] **프론트 확인 방법**: `curl -N .../stream`으로 스트림을 열어둔 채 다른 터미널에서 변경 호출 시 실시간 이벤트 수신

**의존성**: BE-5

**참고 근거**: PRD FR-IM-05~06, PRD 6절(SSE, 단일 프로세스), `4-project-structure-principles.md` 6.2절

---

### BE-7: 백엔드 통합 점검

**목표/범위**: BE-1~BE-6 전체가 실제로 함께 정상 동작하는지 수동 점검하고, 프론트엔드 연동 시작 시점을 공식화한다.

**완료 조건**
- [ ] 전체 엔드포인트를 curl/Postman으로 순서대로 호출해 상태 코드/응답 스키마 확인, 체크리스트로 기록
- [ ] 미인증 401, 권한 없는 관리자 전용 API 403 확인
- [ ] 낙관적 잠금 충돌(409), 파일 업로드/다운로드, SSE 브로드캐스트를 실제로 재현
- [ ] 발견된 버그는 해당 BE Task로 되돌려 직접 수정
- [ ] **완료 시점 = 프론트엔드가 각 스토어의 내부 구현을 fetch/API 클라이언트로 전면 교체 시작해도 되는 신호**

**의존성**: BE-1~BE-6

**참고 근거**: PRD 8절 Phase 5, `4-project-structure-principles.md` 4절

---

## 프론트엔드 영역

기존 `src/routes`, `src/lib` 구조는 그대로 두고 내부 구현만 교체하는 방향(`4-project-structure-principles.md` 최상위 원칙 4)을 따른다. 아래 각 Task의 "의존성"에는 프론트 내부 Task(`FE-x`)와 실제로 필요한 백엔드 Task(`BE-x`, 위 백엔드 영역과 대조해 번호를 맞춤)를 함께 표기했다.

### FE-1: API 클라이언트 계층 구축

**목표/범위**: `src/lib/api/client.js`(fetch 공통 래퍼)와 리소스별 클라이언트 모듈(`deliverables.js`/`imgagongPlans.js`/`masterItems.js`)의 틀을 만든다.

**완료 조건**
- [ ] `client.js`에 공통 요청 함수가 있고, 실패(4xx/5xx) 시 에러를 던진다(조용히 삼키지 않음)
- [ ] 백엔드가 없어도 호출 시 에러가 콘솔에 명확히 뜬다
- [ ] BE-1의 `/api/health`가 뜬 상태에서 정상 응답이 콘솔에 찍힌다
- [ ] 리소스별 클라이언트에 CRUD 함수 시그니처가 정의되어 있다(실제 사용은 FE-3~FE-6B에서 시작)
- [ ] base URL이 `.env`(`VITE_API_BASE_URL`)로 분리됨

**의존성**: 프론트 내부 의존 없음(가장 먼저 착수) / BE-1(헬스체크 정도만 있으면 검증 가능, 파일 구조 자체는 병렬 착수 가능)

**참고 근거**: `4-project-structure-principles.md` 2절·6.1절, CLAUDE.md

---

### FE-2: 로그인 화면 + 인증 상태 관리

**목표/범위**: 로그인 화면(`src/routes/login/+page.svelte`)과 `authStore.svelte.js`를 만들고, 비로그인 상태 접근 시 `/login`으로 리다이렉트한다. 회원가입 화면은 만들지 않는다.

**완료 조건**
- [ ] 비로그인 상태로 임의 라우트 접속 시 `/login`으로 이동
- [ ] 로그인 성공 시 원래 가려던 페이지로 이동, 사이드바에 로그인 사용자 표시
- [ ] 잘못된 자격증명 시 에러 메시지 표시
- [ ] 로그아웃 시 세션 종료 후 `/login`으로 복귀
- [ ] 새로고침해도(세션 유효 시) 로그인 상태 유지(`GET /api/auth/me`로 앱 시작 시 1회 확인)
- [ ] `authStore.svelte.js`가 `role`을 보유해 이후 FE-3/FE-4/FE-6B의 권한 UI 분기에 재사용 가능

**의존성**: FE-1(레이아웃 자체는 mock으로 병렬 착수 가능) / BE-2(로그인/로그아웃/me API, 세션 미들웨어)

**참고 근거**: PRD 5절, PRD 4.4절, `4-project-structure-principles.md` 5절·6.2절

---

### FE-3: Master Page 백엔드 연동

**목표/범위**: 기존 `/master` 화면·`masterStore.svelte.js` 구조는 유지하고, 내부만 `api/masterItems.js` fetch로 교체.

**완료 조건**
- [ ] 접속 시 서버 조회 목록이 표시되고 새로고침해도 유지
- [ ] 항목 추가/삭제가 즉시 반영되고 새로고침해도 유지
- [ ] 탭 2개로 확인 시 한쪽 추가가 다른 쪽에도 보임(=DB 저장 확인)
- [ ] 관리자가 아니면 추가/삭제 버튼 비활성화 또는 "권한 없음" 에러
- [ ] 임가공 Plan의 dropdown이 여전히 Master Page 값을 그대로 사용(임가공 Plan 쪽 코드는 무변경)

**의존성**: FE-1, FE-2(권한 UI; API 연동 자체는 FE-2 없이도 우선 진행 가능) / BE-3

**참고 근거**: PRD 3.4절, 사용자시나리오 4절(시나리오 3, 예외 3-1~3-3), CLAUDE.md

---

### FE-4: Deliverables Page 신규 라우트 구현

**목표/범위**: `src/routes/deliverables/+page.svelte`, `deliverablesStore.svelte.js` 신규 작성. `+layout.svelte`의 `menuItems`에 메뉴 추가 포함.

**완료 조건**
- [ ] 사이드바에 "Deliverables" 메뉴가 보이고 목록 표(차수/공정명/파일명/등록일시/등록자) 표시
- [ ] "Create" 팝업으로 차수/공정명/파일 등록 시 표 맨 위에 새 행 추가
- [ ] 차수/공정명 미입력 시 "필수 입력값" 에러, 10MB 초과 파일 시 경고 후 등록 안 됨
- [ ] "다운로드" 버튼으로 원본 파일 그대로 다운로드
- [ ] 체크박스 선택 후 삭제 → 확인 팝업 → 삭제, 새로고침해도 미표시
- [ ] 새로고침해도 목록 유지(DB/파일 저장 확인)

**의존성**: FE-1(UI 골격은 mock으로 병렬 착수 가능) / BE-4

**참고 근거**: 도메인정의서 3절/6절, PRD 3.1절, 사용자시나리오 2절(시나리오 1, 예외 1-1~1-3), `4-project-structure-principles.md` 6.1절

---

### FE-5: MapGen Web에 "Excel 파일 선택" 입력 방식 추가 (FR-MG-02)

**목표/범위**: 기존 붙여넣기(FR-MG-01)는 유지, "Excel 파일 선택" 버튼과 `DeliverablesPickerModal.svelte` 신규 팝업으로 Deliverables 목록에서 선택해 자동으로 도면을 그리게 한다.

> **✅ 계획 단계에서 발견 → 해결된 기술 이슈**: `src/lib/parseModuleData.js`는 "엑셀에서 복사한 탭 구분 텍스트"를 입력으로 받도록 만들어져 있어(파일 자체 주석에도 명시), Deliverables의 `.xlsx` 바이너리를 곧바로 textarea에 넣을 수 없다는 문제를 실제 코드로 확인했다. **SheetJS(`xlsx` 패키지)를 클라이언트 파싱 라이브러리로 채택**하기로 결정하고 PRD 6절에 반영 완료했다.

**완료 조건**
- [ ] "Excel 파일 선택" 버튼이 보이고 기존 붙여넣기도 그대로 동작
- [ ] 버튼 클릭 시 Deliverables 목록(차수/공정명/등록일시)이 표 팝업으로 표시
- [ ] 항목 선택 시 파일을 내려받아 **xlsx 파싱 → 기존 파싱 로직 → textarea 자동 입력 → canvas 도면**까지 이어짐
- [ ] textarea에 기존 데이터가 있으면 "덮어쓰시겠습니까?" 확인 후 진행
- [ ] 파일 다운로드 실패 시 에러 메시지, textarea는 비어있는 상태 유지
- [ ] 같은 항목을 두 번 선택해도 동일한 도면 재현(파싱 일관성)

**의존성**: FE-4(Deliverables 목록/다운로드 재사용) / BE-4(신규 API 없음, 기존 재사용). xlsx 파싱 라이브러리 도입은 프론트 전용이라 백엔드 의존 없이 병렬 개발 가능(E2E 검증만 FE-4 이후)

**참고 근거**: PRD 3.2절(FR-MG-02), 도메인정의서 6절, 사용자시나리오 2절(시나리오 1, 예외 1-4/1-5), `src/lib/parseModuleData.js`(직접 확인)

---

### FE-6A: 임가공 Plan 백엔드 연동 (CRUD + 기간 필터)

**목표/범위**: 기존 `/imgagong` 화면·`imgagongStore.svelte.js` UI는 유지, 내부만 fetch로 교체. "품의상신"/"예산정보" 버튼은 이 Task에서 삭제(2차 스코프 제외 확정 사항).

**완료 조건**
- [ ] 접속 시 서버 저장 행이 표시되고 새로고침해도 유지
- [ ] "Add Row"로 등록 시 즉시 반영(생성일시/status='new' 자동), 새로고침해도 유지
- [ ] inline 수정(dropdown/key-in)이 서버에 저장되고 새로고침해도 유지
- [ ] 조회 기간 필터 변경 시 서버에서 재조회
- [ ] 체크박스 삭제 정상 동작, 본인 아닌 행을 비관리자가 삭제 시도 시 에러
- [ ] "품의상신"/"예산정보" 버튼이 화면에서 사라짐

**의존성**: FE-1, FE-2(삭제 권한 판단) / BE-5. SSE·낙관적 잠금 UI·의뢰확정은 FE-6B 범위

**참고 근거**: PRD 3.3절(FR-IM-01~04), 사용자시나리오 3절(시나리오 2, 예외 2-1/2-3), 도메인정의서 6·7절

---

### FE-6B: 임가공 Plan 실시간 공유 + 의뢰확정 일괄 처리 (FR-IM-05, FR-IM-06)

**목표/범위**: FE-6A 위에 SSE 기반 실시간 반영, 낙관적 잠금 충돌 UI, "의뢰 확정" 일괄 처리 버튼을 추가한다.

**완료 조건**
- [ ] 탭 2개 동시 접속 시 한쪽의 행 추가/수정이 새로고침 없이 다른 쪽에 반영
- [ ] 같은 행을 두 탭에서 거의 동시에 편집 시, 나중 저장 쪽에 "다른 사용자가 먼저 수정했습니다" 에러(충돌 재현 확인)
- [ ] 'new' 상태 행을 여러 개 체크 후 "의뢰 확정" → 확인 팝업 → 일괄 상태 변경
- [ ] 의뢰 확정 결과가 다른 탭/사용자에게도 실시간 반영
- [ ] "의뢰 확정" 버튼은 관리자 권한에서만 동작
- [ ] 네트워크 재연결(개발자도구 offline 토글) 후 놓친 변경사항이 반영됨

**의존성**: FE-6A / BE-6. (버튼 UI/확인 팝업 자체는 mock으로 먼저 제작 가능하나 실제 검증은 BE-6 필요)

**참고 근거**: PRD 3.3절(FR-IM-05/06), PRD 4.2·6절, 사용자시나리오 3절(월말 취합~의뢰확정, 예외 2-2/2-4)·5절(시나리오 4), `4-project-structure-principles.md` 6.1절

---

### FE-7: 프론트엔드 통합 점검

**목표/범위**: `docs/3-user-scenario.md`의 4개 시나리오를 브라우저에서 실제로 처음부터 끝까지 확인한다. 코드 작성이 아닌 검증 Task.

**완료 조건**
- [ ] 시나리오 1(Deliverables 등록→MapGen 도면 생성) 로그인부터 끝까지 재현
- [ ] 시나리오 2(임가공 등록→취합→의뢰확정)를 시크릿창 2개로 재현, 실시간 반영 확인
- [ ] 시나리오 3(Master 항목 추가→dropdown 즉시 반영)을 두 탭으로 재현
- [ ] 시나리오 4의 동시 편집 충돌이 낙관적 잠금 메시지로 정상 처리됨을 확인
- [ ] 예외 시나리오 5개 이상(필수값 누락/파일크기초과/권한없는삭제/Master접근/네트워크재연결)을 의도적으로 재현
- [ ] 발견된 불일치/버그를 목록화해 해당 FE Task로 되돌림(이 Task 자체에서 코드 수정 안 함)

**의존성**: FE-1~FE-6B 전체 / BE-7

**참고 근거**: `docs/3-user-scenario.md` 전체, PRD 8절 Phase 5

---

## 발견된 이슈 (계획 수립 중 새로 드러남 → 모두 이번 개정에서 해소)

- **✅ xlsx 클라이언트 파싱 라이브러리 (FE-5)**: SheetJS(`xlsx` 패키지) 채택 결정, PRD 6절에 반영 완료.
- **✅ 의뢰 확정 상태값 이름 (BE-6)**: `'requested'`로 확정, PRD FR-IM-06·부록·DB-3 시드에 반영 완료.
- **✅ `imgagong_plans` 필수 필드 범위 (DB-2/BE-5)**: 구분/조립처/Chip size/PKG Type/과제 담당자를 필수로, 나머지는 선택으로 잠정 결정하고 `database/schema.sql`의 NOT NULL 제약과 PRD FR-IM-01에 반영했다. **다만 이는 실제 업무 규칙을 대신 정한 것이 아니라 실행계획 진행을 막지 않기 위한 잠정 결정이므로, 실제 운영 전에는 반드시 업무 담당자 확인이 필요하다.**

---

**작성 근거 문서**: `docs/1-domain-definition.md`, `docs/2-PRD.md`, `docs/3-user-scenario.md`, `docs/4-project-structure-principles.md`, `docs/5-arch-diagram.md`, `docs/6-erd.md`, `database/schema.sql`
