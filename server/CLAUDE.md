# 백엔드 개발 지침 (`server/`)

루트 `CLAUDE.md`(프로젝트 공통 지침)에 더해, `server/` 아래 작업에 적용한다.

### 반드시 지켜야 할 것

- 오버엔지니어링 금지
- 지침에 있는 기능만을 정확히 구현할 것 — 기준은 GitHub 이슈의 Todo·완료 조건, `docs/7-execution-plan.md`, `swagger/swagger.json`. 문서와 swagger가 어긋나면 문서 기준으로 맞추고, 정해지지 않은 것은 임의로 정하지 말고 사용자에게 묻는다.

### 적용 원칙

- SOLID 원칙 적용
- CLEAN 아키텍쳐 준수
- 이 프로젝트에서의 해석 (`docs/4-project-structure-principles.md` 2절):
  - 계층은 `routes → controller → service → repository → db/connection` 4단. 의존은 위에서 아래로만, 역방향·계층 건너뛰기 import 금지.
  - 단일 책임: routes는 URL 매핑만, controller는 req/res와 요청 형식 검증만, service는 업무 규칙만(req/res를 모른다), repository는 Knex 쿼리와 snake_case↔camelCase 변환만.
  - 교체 가능성: 인증은 `src/middleware/auth.js` 한 곳에 격리하고 passport는 이 파일에서만 쓴다(1차 시스템 인증으로 바꿀 때 이 파일만 교체).
  - 인터페이스·DI 컨테이너·DTO 클래스·공통 베이스 클래스는 만들지 않는다. 원칙은 위 계층 분리로 지키고, 추상화는 필요해질 때 추가한다.

### 구조와 규칙

- 리소스별 폴더: `src/<resource>/<resource>.{routes,controller,service,repository}.js`(kebab-case), `src/routes.js`에 `router.use('/<resource>', ...)` 한 줄로 등록.
- CommonJS, Node 24, Express 5(async 핸들러의 reject는 자동으로 errorHandler에 전달됨).
- API JSON 필드는 camelCase, DB는 snake_case. 변환(컬럼명과 `fieldName` 값 `chipSize`↔`chip_size` 등)은 repository에서만 한다.
- 에러 응답은 `{ error: { message } }`.
  - 요청 형식 오류(400)는 controller가 직접 응답.
  - 업무 규칙 위반(404, 409 등)은 service에서 `throw Object.assign(new Error('메시지'), { status })`.
  - 예상 못한 에러는 errorHandler가 500 고정 메시지로 숨긴다.
- 권한은 라우트에 `requireAuth`/`requireAdmin`(`src/middleware/auth.js`)을 붙여서 처리한다. 관리자는 `role === 'admin'`.
- 모듈은 객체째 import하고 호출 시점에 꺼내 쓴다(`const xxxService = require(...)` → `xxxService.fn()`) — 테스트에서 함수를 바꿔 끼울 수 있게.
- 환경변수는 `server/.env`(knexfile이 `process.loadEnvFile`로 로딩, git 제외). 새 키는 `server/.env.example`에 추가하고, `.env`의 값은 출력하지 않는다.
- DB 변경은 새 migration 파일로 한다(기존 migration 수정 금지). seed에서 `del()`은 FK(`ON DELETE SET NULL`)가 걸린 테이블에 쓰지 않는다.
- 주석은 한국어 학습용 설명 스타일(기존 `src/auth`, `src/master-items` 참고).

### 테스트

- `node:test` + `supertest`. 실제 PostgreSQL에 접속하지 않도록 `src/db/connection.js`를 `require.cache`로 가짜 Knex로 대체한다(`test/auth.test.js`, `test/masterItems.test.js` 패턴).
- 이슈마다 그 이슈가 만든 코드를 검증하는 테스트를 작성하고, 커버리지 80% 이상(lines/branches/functions)을 유지한다 — `test` 스크립트가 미달이면 실패한다.
- 테스트 파일은 app을 require하기 전에 `process.env.SESSION_SECRET`을 설정한다.

### 명령어 (`server/`에서)

- `pnpm dev` / `pnpm start` — `http://localhost:3001/api` (목 서버 3000과 동시 실행 가능)
- `pnpm test` — 테스트 + 커버리지 검사
- `npx knex migrate:latest` / `npx knex seed:run` — 스키마 적용 / 초기 데이터(master_items 20행, 관리자 계정)
- 이슈 처리: `/issue-resolver-backend <이슈 번호>`
