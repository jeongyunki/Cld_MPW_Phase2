# MPW Plus 백엔드 (server/)

Express + Knex + PostgreSQL 백엔드입니다. 아래는 로컬 DB를 처음부터 준비하는 순서입니다.

## 1. PostgreSQL 설치/기동

- Windows 설치형 PostgreSQL(검증 버전: 18) 기준. 설치하면 `postgresql-x64-<버전>` 서비스가 자동 기동됩니다.
- 기동 확인: PowerShell에서 `Get-Service *postgres*` → `Running`
- `psql`은 `C:\Program Files\PostgreSQL\<버전>\bin`에 있습니다 (PATH에 없으면 전체 경로로 실행).

## 2. 전용 DB 생성

```sh
psql -U postgres -c "CREATE DATABASE mpw_plus"
```

## 3. 의존성 설치

저장소 루트에서 한 번 실행하면 프론트/`mockup`/`server`가 모두 설치됩니다.

```sh
pnpm install
```

## 4. `.env` 작성

```sh
cd server
cp .env.example .env
```

`.env`의 `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_*`를 채웁니다. `DB_POOL_MIN`/`DB_POOL_MAX`는 비워두면 기본값(2/10)입니다. `PORT`는 백엔드 HTTP 포트이며, 목 서버(3000)와 동시에 실행할 수 있도록 3001입니다.

```
DATABASE_URL=postgresql://postgres:<비밀번호>@localhost:5432/mpw_plus
PORT=3001
SESSION_SECRET=<아래 명령으로 생성한 값>
ADMIN_EMAIL=admin@mpw.local
ADMIN_PASSWORD=<관리자 비밀번호>
ADMIN_NAME=관리자
UPLOAD_DIR=
```

`SESSION_SECRET`은 세션 쿠키 서명용 비밀값이며 필수입니다 (비어 있으면 모든 API 요청이 500). 생성:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`ADMIN_*`는 5절의 관리자 seed가 사용합니다. 일반 사용자(role `user`) 테스트 계정이 필요하면 `TEST_USER_EMAIL`/`TEST_USER_PASSWORD`/`TEST_USER_NAME`도 채웁니다(비워 두면 만들지 않음).

`UPLOAD_DIR`은 업로드 파일 저장 루트이며 비우면 `server/uploads`입니다 (상대경로는 `server/` 기준, git 제외). Deliverables 파일은 `<루트>/deliverables/{id}.{xlsx|xls}`로 저장됩니다.

`.env`는 git에 올라가지 않습니다. `knexfile.js`가 시작할 때 이 파일을 읽습니다.

## 5. 테이블 생성 + 초기 데이터

`server/` 폴더에서 실행합니다.

```sh
npx knex migrate:latest   # 테이블 4개 생성 (users, deliverables, imgagong_plans, master_items)
npx knex seed:run         # master_items 초기 dropdown 20행 + 관리자 계정 1명 (+ TEST_USER_*가 있으면 일반 사용자 1명, 재실행해도 중복 없음)
```

관리자 seed는 `.env`의 `ADMIN_*` 값으로 계정을 만들고, 재실행하면 `.env`의 현재 값으로 갱신합니다. 관리자만 다시 넣으려면:

```sh
npx knex seed:run --specific=02_admin_user.js
```

확인:

```sh
psql -U postgres -d mpw_plus -c "SELECT COUNT(*) FROM master_items"   # → 20
psql -U postgres -d mpw_plus -c "SELECT email, role FROM users"          # → admin@mpw.local | admin
```

## 6. 서버 실행

`server/` 폴더에서 실행합니다 (저장소 루트에서는 `pnpm --filter server dev`).

```sh
pnpm dev     # 파일을 고치면 자동 재시작 (node --watch)
pnpm start   # 일반 실행
```

확인 (PowerShell에서는 `curl` 대신 `curl.exe`):

```sh
curl http://localhost:3001/api/health   # → {"status":"ok"}
```

- 목 서버(`mockup/`, 3000)와 포트가 달라 동시에 실행할 수 있습니다.
- `node --watch`는 `.env` 변경을 감지하지 않습니다. `.env`를 고쳤다면 서버를 직접 다시 시작하세요.

## 7. 인증(세션)

- 로그인하면 서버가 세션을 만들고 쿠키 `connect.sid`(HttpOnly, SameSite=Lax)를 발급합니다.
- 마지막 요청 후 30분간 요청이 없으면 만료됩니다 (요청할 때마다 연장). remember-me는 없습니다.
- 세션은 서버 메모리(MemoryStore)에 있어 서버를 재시작하면 모두 로그아웃됩니다.
- 프론트는 `fetch`에 `credentials: 'include'`를 써야 쿠키가 전달됩니다.
- `SESSION_SECRET`이 없으면 모든 API 요청이 500입니다.

확인 (쿠키를 `cookies.txt`에 저장해 재사용):

```sh
curl.exe -c cookies.txt -H "Content-Type: application/json" -d '{"email":"admin@mpw.local","password":"<비밀번호>"}' http://localhost:3001/api/auth/login
curl.exe -b cookies.txt http://localhost:3001/api/auth/me
curl.exe -b cookies.txt -X POST http://localhost:3001/api/auth/logout
```

일반 사용자는 화면/API가 없어 직접 등록합니다. `server/`에서 해시를 만들고 psql로 INSERT합니다. `role`이 NULL이면 일반 사용자, `'admin'`이면 관리자입니다.

```sh
node -e "console.log(require('bcryptjs').hashSync('비밀번호', 10))"
psql -U postgres -d mpw_plus -c "INSERT INTO users (name, email, password_hash) VALUES ('홍길동', 'hong@mpw.local', '<위에서 나온 해시>')"
```

## 8. Master 항목 API

임가공 Plan의 dropdown 항목(`status`, `category`, `assembler`, `chipSize`, `pkgType`)을 관리합니다.

- `GET /api/master-items` — 로그인 사용자. `fieldName`별로 묶어서 돌려주며, 항목이 없는 필드도 `[]`로 항상 포함합니다.
- `POST /api/master-items` — 관리자만. 본문 `{ "fieldName": "chipSize", "itemName": "16인치" }`. `itemName`은 앞뒤 공백을 제거해 저장하고, 같은 필드의 맨 뒤 순번을 자동으로 붙입니다. 같은 필드에 같은 이름(대소문자 구분)이 있으면 409입니다.
- `DELETE /api/master-items/:id` — 관리자만. 이미 임가공 Plan에서 쓰는 값이어도 삭제되며, 응답의 `affectedImgagongPlanCount`로 영향받는 Plan 행 수를 알려줍니다 (Plan 행의 값은 그대로 남습니다). id가 없거나 uuid 형식이 아니면 404입니다.
- `fieldName`이 위 5개가 아니거나(예: DB 컬럼명 `chip_size`) `itemName`이 비어 있으면 400, 비로그인은 401, 일반 사용자의 POST/DELETE는 403입니다.

확인 (7절의 `cookies.txt` 재사용):

```sh
curl.exe -b cookies.txt http://localhost:3001/api/master-items
curl.exe -b cookies.txt -H "Content-Type: application/json" -d '{"fieldName":"chipSize","itemName":"TEST-ITEM"}' http://localhost:3001/api/master-items
curl.exe -b cookies.txt -X DELETE http://localhost:3001/api/master-items/<위 응답의 id>
```

## 9. Deliverables API

MPW 차수·공정별 엑셀 산출물을 업로드/다운로드합니다. 모든 엔드포인트는 로그인 사용자용입니다.

- `GET /api/deliverables?page=1&limit=20&search=` — 최신순 목록 `{ data, total, page, limit }`. `search`는 차수·공정명에 대소문자 무시로 포함된 행만 남깁니다. `page`/`limit`이 1 이상의 정수가 아니면 400입니다.
- `POST /api/deliverables` — `multipart/form-data`. 필드 `mpwRound`, `processName`(앞뒤 공백 제거)과 파일 `file`. 확장자 `.xlsx`/`.xls`(대소문자 무시)만, 최대 10MB. 필드 누락·확장자 오류·크기 초과는 400, 성공하면 201입니다. 같은 차수·공정명도 여러 번 등록할 수 있습니다.
- `GET /api/deliverables/:id/download` — 원본 파일명으로 내려받습니다. id가 uuid가 아니거나 행이 없으면 404, 행은 있는데 파일이 없어도 404입니다.
- `DELETE /api/deliverables/:id` — 등록자 본인 또는 관리자만(등록자가 없는 행은 관리자만). 아니면 403입니다. DB 행과 디스크 파일을 함께 지웁니다.
- 파일은 사용자가 올린 이름이 아니라 `{uuid}.{xlsx|xls}`로 저장하며, 원본 파일명은 DB(`original_file_name`)에 보관합니다. 이 컬럼은 새 migration이 추가하므로 `npx knex migrate:latest`를 먼저 실행하세요.

확인 (7절의 `cookies.txt` 재사용):

```sh
curl.exe -b cookies.txt -F "mpwRound=MPW2026-Q3" -F "processName=0.13um" -F "file=@chip_design.xlsx" http://localhost:3001/api/deliverables
curl.exe -b cookies.txt "http://localhost:3001/api/deliverables?page=1&limit=20&search=0.13"
curl.exe -b cookies.txt -OJ http://localhost:3001/api/deliverables/<위 응답의 id>/download
curl.exe -b cookies.txt -X DELETE http://localhost:3001/api/deliverables/<위 응답의 id>
```

## 10. 임가공 Plan API

임가공 Plan 행을 조회/추가/수정/삭제합니다. 모든 엔드포인트는 로그인 사용자용입니다.

- `GET /api/imgagong-plans?page=1&limit=20&startMonth=2026-01&endMonth=2026-12` — 생성일시(`createdAt`) 최신순 목록 `{ data, total, page, limit }`. `startMonth`는 해당 월 1일 0시 이상, `endMonth`는 종료월 다음 달 1일 0시 미만(종료월 포함)이며, 생략한 쪽은 경계가 없습니다. 시작 > 종료이면 빈 결과입니다. `page`/`limit`이 1 이상의 정수가 아니거나 `startMonth`/`endMonth`가 `YYYY-MM` 형식이 아니면 400입니다.
- `POST /api/imgagong-plans` — 필수 `category`, `assembler`, `chipSize`, `pkgType`, `owner`(앞뒤 공백 제거, 비면 400), 선택 `module`, `projectName`, `gcmCode`, `customer`, `lotCount`, `pkgQty`. `status`는 body에 보내도 무시되고 항상 `'new'`로 저장되며 `version`은 1에서 시작합니다. 성공하면 201입니다.
- `PATCH /api/imgagong-plans/:id` — body에 `version`(화면에서 본 버전)이 필수이고, 바꿀 필드만 함께 보냅니다(목록에 없는 키는 무시, 수정할 필드가 없으면 400). `status`는 관리자만 바꿀 수 있어 일반 사용자가 `status` 키를 보내면(값과 무관) 403입니다. 성공하면 `version`이 1 올라간 행을 돌려줍니다.
- `DELETE /api/imgagong-plans/:id` — 행의 `owner`(과제 담당자)가 로그인 사용자 이름과 같거나(앞뒤 공백 무시) 관리자일 때만 삭제됩니다. 사용자 이름이 비어 있으면 관리자만 가능하고, 아니면 403입니다. `owner`는 이름 문자열이라 오타·동명이인이 있을 수 있고, `owner`를 수정해 삭제 권한을 얻을 수도 있습니다.
- id가 없거나 uuid 형식이 아니면 404, 비로그인은 401입니다.
- `PATCH /api/imgagong-plans/bulk-confirm` — **관리자 전용**. body `{ "ids": [uuid, ...] }`. status가 `checked`인 행만 `requested`로 바꾸고(version+1) 바뀐 행만 `{ data: [...] }`로 돌려준다. 그 밖의 행·없는 id는 건너뛴다(부분 성공, 0개여도 200). ids가 배열이 아니거나 비어 있거나 uuid가 아닌 원소가 있으면 400, 일반 사용자는 403.
- `GET /api/imgagong-plans/stream` — SSE 실시간 알림(로그인 필요). 연결을 열어 두면 `created`·`updated`·`deleted`·`bulk-confirmed` 이벤트가 오고, 30초마다 `: ping`이 온다. 재연결 때 놓친 변경은 보내 주지 않으므로 목록을 다시 조회한다.
- 상태 흐름: `new → checked → requested(의뢰 확정) → approved(결재 완료)`
- 낙관적 잠금: 다른 사용자가 먼저 같은 행을 저장해 `version`이 올라가 있으면 PATCH는 409(`다른 사용자가 먼저 이 행을 수정했습니다. 페이지를 새로고침한 후 다시 시도하세요`)입니다. 새로고침해서 최신 `version`을 받은 뒤 다시 시도하세요.

확인 (7절의 `cookies.txt` 재사용):

```sh
curl.exe -b cookies.txt -H "Content-Type: application/json" -d '{"category":"산학","assembler":"A사","chipSize":"8인치","pkgType":"QFN","owner":"홍길동"}' http://localhost:3001/api/imgagong-plans
curl.exe -b cookies.txt "http://localhost:3001/api/imgagong-plans?startMonth=2026-01&endMonth=2026-12"
curl.exe -b cookies.txt -X PATCH -H "Content-Type: application/json" -d '{"version":1,"module":"M1"}' http://localhost:3001/api/imgagong-plans/<위 응답의 id>
curl.exe -b cookies.txt -X DELETE http://localhost:3001/api/imgagong-plans/<위 응답의 id>
curl.exe -N -b cookies.txt http://localhost:3001/api/imgagong-plans/stream
curl.exe -b cookies.txt -X PATCH -H "Content-Type: application/json" -d '{"ids":["<id>"]}' http://localhost:3001/api/imgagong-plans/bulk-confirm
```

## 11. 테스트

```sh
pnpm test                        # 전체 테스트 + 커버리지 (80% 미만이면 실패)
node --test test/app.test.js     # 파일 하나만
```

실제 DB는 필요 없습니다. 테스트는 DB 연결 모듈을 가짜로 바꿔서 실행합니다.

## 자주 쓰는 명령

| 명령                                            | 설명                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm dev`                                      | 개발 서버 실행 (파일 변경 시 자동 재시작)                                              |
| `pnpm start`                                    | 서버 실행                                                                              |
| `pnpm test`                                     | 테스트 + 커버리지 검사 (80% 미만이면 실패)                                             |
| `npx knex migrate:latest`                       | 아직 적용 안 된 migration 적용                                                         |
| `npx knex migrate:rollback`                     | 마지막 migration 묶음 되돌리기 (테이블 삭제)                                           |
| `npx knex seed:run`                             | 초기 데이터 다시 넣기 (`master_items`는 지우고 다시 넣고, 관리자는 `.env` 값으로 갱신) |
| `npx knex seed:run --specific=02_admin_user.js` | 관리자 계정만 `.env` 값으로 만들기/갱신                                                |
