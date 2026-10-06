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

`.env`의 `DATABASE_URL`을 채웁니다. `DB_POOL_MIN`/`DB_POOL_MAX`는 비워두면 기본값(2/10)입니다.

```
DATABASE_URL=postgresql://postgres:<비밀번호>@localhost:5432/mpw_plus
```

`.env`는 git에 올라가지 않습니다. `knexfile.js`가 시작할 때 이 파일을 읽습니다.

## 5. 테이블 생성 + 초기 데이터

`server/` 폴더에서 실행합니다.

```sh
npx knex migrate:latest   # 테이블 4개 생성 (users, deliverables, imgagong_plans, master_items)
npx knex seed:run         # master_items 초기 dropdown 20행 (재실행해도 중복 없음)
```

확인:

```sh
psql -U postgres -d mpw_plus -c "SELECT COUNT(*) FROM master_items"   # → 20
```

## 자주 쓰는 명령

| 명령                        | 설명                                                 |
| --------------------------- | ---------------------------------------------------- |
| `npx knex migrate:latest`   | 아직 적용 안 된 migration 적용                       |
| `npx knex migrate:rollback` | 마지막 migration 묶음 되돌리기 (테이블 삭제)         |
| `npx knex seed:run`         | 초기 데이터 다시 넣기 (기존 `master_items`는 지워짐) |
