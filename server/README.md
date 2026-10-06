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
```

`SESSION_SECRET`은 세션 쿠키 서명용 비밀값이며 필수입니다 (비어 있으면 모든 API 요청이 500). 생성:

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`ADMIN_*`는 5절의 관리자 seed가 사용합니다.

`.env`는 git에 올라가지 않습니다. `knexfile.js`가 시작할 때 이 파일을 읽습니다.

## 5. 테이블 생성 + 초기 데이터

`server/` 폴더에서 실행합니다.

```sh
npx knex migrate:latest   # 테이블 4개 생성 (users, deliverables, imgagong_plans, master_items)
npx knex seed:run         # master_items 초기 dropdown 20행 + 관리자 계정 1명 (재실행해도 중복 없음)
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

## 9. 테스트

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
