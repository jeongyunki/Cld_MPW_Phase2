# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 작업 규칙

- **모든 대화는 한국어로 한다.** (답변, 설명, 질문, 요약 모두 해당)
- **오버엔지니어링 금지.** 요청받은 것만 가장 단순한 방식으로 구현한다. 요청하지 않은 추상화, 설정 옵션, 확장용 구조, 방어 코드, 미래를 대비한 일반화를 추가하지 않는다. 필요해지는 시점에 그때 만든다.
- 영역별 지침은 따로 있다: 백엔드는 `server/CLAUDE.md`, 프론트엔드는 `src/CLAUDE.md`. 이 파일은 프로젝트 공통 지침이다.

## 명령어

패키지 매니저는 **pnpm**입니다 (`.npmrc`에 `engine-strict=true`). 저장소는 pnpm 워크스페이스로, 루트(프론트) + `mockup/` + `server/`가 `pnpm-workspace.yaml`의 `packages`에 등록되어 있고 lockfile은 루트 `pnpm-lock.yaml` 하나입니다. 의존성 설치는 루트에서 `pnpm install` 한 번으로 세 곳이 모두 설치됩니다. 하위 패키지에 의존성을 추가할 때는 해당 폴더에서 `pnpm add` 하거나 루트에서 `pnpm --filter <server|mockup> add`를 씁니다 (새 하위 패키지를 만들면 `packages`에 먼저 등록할 것 — 등록하지 않으면 lockfile에서 다른 패키지 항목이 덮어써질 수 있음).

- `pnpm dev` — Vite 개발 서버
- `pnpm build` / `pnpm preview` — 프로덕션 빌드 / 미리보기
- `pnpm check` — `svelte-kit sync` + `svelte-check` (타입 검사)
- `pnpm check:watch` — 위 타입 검사를 watch 모드로 실행
- `pnpm lint` — `prettier --check . && eslint .`
- `pnpm format` — `prettier --write .`
- `pnpm test` — Vitest (프론트 `src/lib`의 Svelte 비의존 모듈, 커버리지 80% 미만이면 실패)

프론트 테스트는 `pnpm test`(Vitest, `vite.config.ts`의 `test` 블록 공유, `fetch`는 `vi.stubGlobal`로 가짜로 대체, 현재 대상 `src/lib/api`, `src/lib/imgagongRow.js`, `src/lib/masterItem.js`, `src/lib/deliverableRow.js`, `src/lib/xlsxToText.js`, `src/lib/xlsxImage.js`)이고, 파일 하나만 돌리려면 `pnpm vitest run src/lib/api/client.test.js`입니다. 백엔드(`server/`)는 `pnpm --filter server test`(node:test + supertest, DB 연결 모듈은 가짜로 대체, 커버리지 80% 미만이면 실패)이고, 파일 하나만 돌리려면 `cd server && node --test test/app.test.js`입니다.

목 API 서버 (`mockup/`, 별도 스크립트 없음): `cd mockup && node server.js` → `http://localhost:3000/api/*`가 `swagger/swagger.json` 기반 목 응답을, `http://localhost:3000/docs`가 Swagger UI를 제공합니다.

백엔드 서버 (`server/`): `pnpm --filter server dev` (또는 `server/`에서 `pnpm dev` / `pnpm start`) → `http://localhost:3001/api/*`. 포트는 `server/.env`의 `PORT`이며 목 서버와 동시에 실행할 수 있습니다.

## 개요

"MPW Plus" 사내 도구의 **2차 개발분**입니다. 사내에서 운영 중인 1차 시스템(저장소 밖)에 붙을 기능을 개발하며, 한 저장소 안에 두 애플리케이션이 있습니다.

- **프론트엔드** (루트, `src/`) — SvelteKit (Svelte 5 runes, Tailwind v4, `adapter-auto`). 아직 백엔드와 연동되지 않아 모든 데이터가 브라우저 메모리에만 있습니다(새로고침하면 사라짐). 단, 임가공 Plan(FE-6A)과 Master Page(FE-3)는 서버 연동 완료. 연동은 FE Task에서 스토어 내부를 교체하는 방식으로 진행합니다.
- **백엔드** (`server/`) — Express 5 + Knex + PostgreSQL(로컬 DB `mpw_plus`). 실행계획의 Task 단위로 구현 중입니다.

진행 상황은 `docs/7-execution-plan.md`의 완료 조건 체크박스와 GitHub 이슈(Stage 1~6, 제목 `[Stage N] <Task ID>: ...`)로 관리합니다. 작업은 이슈마다 `feature-<이슈 번호>` 브랜치 → PR → main merge(`Closes #N`) 순서로 하고, 백엔드 이슈는 `/issue-resolver-backend <이슈 번호>`로 처리합니다.

코드 주석과 UI 문구는 한국어이며, 주석은 학습용 설명 형태(예: Svelte를 React와 비교)로 씁니다. 새 코드도 같은 스타일을 따릅니다.

프론트 라우트는 5개이며, `src/routes/+layout.svelte`의 `menuItems` 배열에 등록되어 있습니다 (라우트를 추가할 때는 여기에 메뉴 항목도 추가할 것):

- `/` Welcome
- `/deliverables` Deliverables — 차수/공정명/엑셀 파일 등록·검색·페이지네이션·다운로드·삭제 (FE-4, 서버 연동)
- `/mapgen` MapGen Web — 엑셀 셀(탭으로 구분된 텍스트)을 붙여넣어 파싱하고, 칩 이미지 위에 module 사각형 / sawing line / 치수 화살표를 `<canvas>`로 그림 (약 1200줄짜리 단일 페이지 컴포넌트). "📋 Excel 파일 선택"(FE-5, `DeliverablesPickerModal.svelte`)으로 Deliverables의 xlsx를 고르면 첫 시트를 탭 구분 텍스트로 바꿔 textarea에 넣고(`xlsxToText.js`), 첫 시트에 붙은 이미지를 참조 이미지로 쓴다(`xlsxImage.js`). 이미지가 없으면 이미지 영역에 "image가 없으니 excel 파일을 다시 확인하세요."를 표시
- `/imgagong` 임가공 Plan — 계획 행 테이블 (추가 팝업, 기간 필터, 삭제)
- `/master` Master Page — 임가공 Plan에서 쓰는 dropdown 항목을 추가/삭제

`/login`(로그인 화면, FE-2)은 예외로 `menuItems`에 넣지 않는다. 사이드바·테마 토글 없이 전체 화면으로 그려지고, `+layout.svelte`가 앱 시작 시 `GET /api/auth/me`로 세션을 1회 확인해 비로그인이면 `/login?redirectTo=<원래 경로>`로 보낸다.

## 프론트엔드 아키텍처 (현재 코드)

**공유 상태는 컴포넌트가 아니라 `src/lib/*.svelte.js` 모듈에 둡니다.** `.svelte.js` 확장자 덕분에 컴포넌트 밖에서도 `$state`를 쓸 수 있습니다. 모듈 수준 상태는 페이지 이동 후에도 유지됩니다 (SvelteKit은 이동 시 페이지 컴포넌트를 새로 만들기 때문에, 컴포넌트 내부의 `$state`는 초기화됨).

- `masterStore.svelte.js` — `masterData`(dropdown 항목 목록) + `MASTER_FIELDS` 메타데이터. Master Page가 쓰고, 임가공 Plan이 읽는다. `+layout.svelte`가 로그인 후 `loadMasterItems()`로 서버 `/master-items`를 1회 불러와 채우고(초기값 없음), 삭제용 `id`는 스토어 내부에 따로 둔다. `addMasterItem`/`removeMasterItem`(관리자 전용, 실패 시 throw, 삭제는 영향 행 수 반환)은 서버 호출 성공 후 목록에 반영한다. 응답 변환 순수 함수는 `src/lib/masterItem.js`. 단, `status` 목록은 Master Page에서 편집할 수 있지만 새 행의 status는 서버가 `'new'`로 고정하므로 새 행에는 반영되지 않는다.
- `imgagongStore.svelte.js` — `imgagongRows`와 `loadRows({ startMonth, endMonth })` / `addRow` / `updateRow(row, field)` / `deleteSelectedRows`. 서버 `/imgagong-plans`를 limit 1000으로 기간 조회하며, 페이지의 `$effect`가 기간 변경 시 재조회하고 마지막 요청만 반영한다. 행은 서버 필드(camelCase) + 화면용 `date`(`createdAt`의 로컬 `YYYY-MM-DD HH:MM`) + `_selected`(UI 전용 체크박스 상태)이다. 셀 change 때 `{필드, version}`을 PATCH하고, 401이면 `clearUser()`를 호출한다. 변환 순수 함수는 `src/lib/imgagongRow.js`.
- `theme.svelte.js` — 다크/라이트 모드. `+layout.svelte`가 `<html>`에 `light` class를 붙였다 뗀다. 두 팔레트는 레이아웃의 `<style>`에 CSS 변수(`--bg-page` 등)로 정의되어 있다. 테마가 동작하려면 페이지에서 색을 하드코딩하지 말고 `var(--xxx)`를 써야 한다.
- `authStore.svelte.js` — `auth`(`{ user, checked }`)와 `checkSession` / `login` / `logout` / `clearUser` / `isAdmin`. 화면 이동(`goto`)은 하지 않고, `+layout.svelte`의 가드가 `auth.user`를 보고 `/login`이나 redirectTo로 보낸다. `user.role`로 권한 UI를 분기한다(`isAdmin()`).

이 스토어들이 서버 연동의 유일한 접점입니다 (스토어 내부를 `src/lib/api/*.js` 호출로 교체하고, 페이지 코드는 그대로 두는 방식 — 자세한 규칙은 `src/CLAUDE.md`).

`src/lib/parseModuleData.js`는 Svelte에 의존하지 않는 순수 JS입니다. 붙여넣은 엑셀 텍스트를 파싱합니다: A열 = 이름, D/E열 = width/height, H/I열 = x/y. `One Shot Size`, `MostOuter ScribeLine Size`, `Step pitch` 라벨이 붙은 행은 chip 정보가 됩니다. 네 개의 숫자 셀이 모두 변환되는 행만 module로 인정합니다 (이 방식으로 헤더 행이 걸러짐).

## 2차 개발 설계 문서

구현 작업 전에 아래 문서를 근거로 삼으세요.

- `docs/1`~`8` — 도메인정의서 → PRD → 사용자 시나리오 → 구조설계 원칙 → 아키텍처 → ERD → 실행계획 → 와이어프레임 순서. 구현 Task(DB-1~4, BE-1~7, FE-1~7)와 의존성은 `docs/7-execution-plan.md`에 있습니다.
- `database/schema.sql` — ERD에서 만든 참고용 PostgreSQL DDL (`users`, `deliverables`, `imgagong_plans`, `master_items`). 실제 스키마는 이를 옮긴 Knex migration(`server/src/db/migrations/`)이 기준입니다(`updated_at` 트리거는 넣지 않음 — service가 직접 갱신).
- `swagger/swagger.json` — OpenAPI 3.0.3 REST 스펙 (`/auth/*`, `/deliverables`, `/imgagong-plans`(+`bulk-confirm`, SSE `stream`), `/master-items`). JSON 필드는 camelCase입니다. 문서와 스펙이 어긋나면 문서 기준으로 맞춥니다. 실제 백엔드 포트는 3001이고, `servers`의 3000은 목 서버 주소입니다.

확정된 스택: Express + Knex + PostgreSQL, SSE(단일 프로세스), 로컬 파일 업로드, 낙관적 잠금(`version` 컬럼), 인증은 Passport.js Local + express-session(유휴 30분, 비밀번호 해시는 `bcryptjs`, 나중에 1차 시스템 인증으로 바꿀 수 있도록 `server/src/middleware/auth.js` 하나에 격리).

`docs/4-project-structure-principles.md`에서 정한 구조 원칙의 핵심 (영역별 세부 규칙은 `server/CLAUDE.md`, `src/CLAUDE.md`):

- 프론트: 페이지 → 스토어(`*.svelte.js`) → `src/lib/api/*.js`(API 클라이언트 계층) → 백엔드. 페이지는 `fetch`를 직접 호출하지 않습니다. 신규 라우트는 `/deliverables`입니다.
- 백엔드: `server/src/` 아래 리소스별 폴더(`auth/`, `master-items/` 등)에 `*.routes.js` → `*.controller.js` → `*.service.js` → `*.repository.js`(Knex)를 둡니다. 역방향 import는 금지합니다.
- 네이밍: API 경로는 kebab-case 복수형, API JSON 필드는 camelCase, DB 테이블·컬럼은 snake_case입니다. 변환은 repository 계층에서만 합니다.

## 규칙

- Prettier: 탭, 작은따옴표, 후행 쉼표 없음, 폭 100, Svelte/Tailwind 플러그인 사용 (Tailwind class 정렬은 `src/routes/layout.css`를 참조). 단, 기존 `src/lib`와 `src/routes` 파일 일부는 2칸 들여쓰기와 큰따옴표로 작성되어 있어 `pnpm lint`(`prettier --check`)가 경고를 낼 수 있습니다. 재포맷 diff가 허용될 때만, 수정하는 파일에 한해 `pnpm format`을 실행하세요.
- `pnpm lint`는 현재 전체 저장소 기준으로 통과하지 않습니다(기존 문제, 별도 처리 전). prettier는 기존 포맷 파일과 CRLF 때문에 다수 파일에서 경고를 내고, eslint는 CommonJS인 `server/`·`mockup/`에 `@typescript-eslint/no-require-imports`, 기존 프론트 파일에 `svelte/require-each-key` 등을 냅니다. 작업할 때는 **새로 만들거나 수정한 파일에 한해** `npx prettier --check <파일>`을 통과시키고, eslint는 `no-require-imports` 외의 새 위반이 없는지 확인합니다.
- 이 PC는 git `core.autocrlf=true`라 체크아웃된 파일이 CRLF일 수 있고, 그 경우 `prettier --check`가 경고를 냅니다. 커밋되는 내용은 LF이므로 `git diff`로 실제 변경이 없으면 무시해도 됩니다.
- `static/`은 prettier 대상에서 제외됩니다. MapGen은 기본으로 `/sample/chip.png`(즉 `static/sample/chip.png`)를 사용하는데, 이 파일은 커밋되어 있지 않습니다 — 사용자가 이미지를 선택하거나, 이미지가 붙은 Excel 파일을 "Excel 파일 선택"으로 불러오거나, 이 파일을 추가하기 전까지 canvas는 비어 있습니다.
- SheetJS는 npm 레지스트리 `xlsx@0.18.5`(알려진 취약점 있음, 사내 업로드 파일만 읽는다는 전제로 선택)입니다. 셀 값은 `read`/`utils`로 읽고, 이미지는 SheetJS가 주지 않으므로 같은 패키지의 zip 리더 `CFB`로 xlsx 내부 XML을 따라가 꺼냅니다. SSR(Node)에서는 `xlsx`가 CommonJS로 로드되어 `import { CFB } from 'xlsx'`가 잡히지 않으므로 `vite.config.ts`에 `ssr.noExternal: ['xlsx']`를 두었습니다(지우면 `/mapgen`이 500).
