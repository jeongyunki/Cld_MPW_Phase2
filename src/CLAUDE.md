# 프론트엔드 개발 지침 (`src/`)

루트 `CLAUDE.md`(프로젝트 공통 지침)에 더해, `src/` 아래 SvelteKit 프론트엔드 작업에 적용한다.

### 반드시 지켜야 할 것

- 오버엔지니어링 금지
- 지침에 있는 기능만을 정확히 구현할 것 — 기준은 GitHub 이슈의 Todo·완료 조건, `docs/7-execution-plan.md`, `docs/8-wireframes.md`, `swagger/swagger.json`. 정해지지 않은 화면 동작은 임의로 정하지 말고 사용자에게 묻는다.

### 적용 원칙

- SOLID 원칙 적용
- CLEAN 아키텍쳐 준수
- 이 프로젝트에서의 해석 (`docs/4-project-structure-principles.md` 2절·6.1절):
  - 의존 방향은 `페이지/컴포넌트(+page.svelte) → 스토어(src/lib/*.svelte.js) → API 클라이언트(src/lib/api/*.js) → 백엔드`. 역방향 import 금지.
  - 단일 책임: 페이지는 화면 표시와 사용자 입력만, 스토어는 상태 관리만, `src/lib/api/*.js`는 통신만 담당한다. **페이지에서 `fetch`를 직접 호출하지 않는다.**
  - 기존 페이지·스토어의 구조와 export는 유지하고, 백엔드 연동은 스토어 내부 구현만 교체한다(페이지 코드는 가능한 한 그대로).
  - 상태 관리 라이브러리, 범용 컴포넌트 라이브러리, 추상 베이스 컴포넌트는 만들지 않는다.

### 구조와 규칙

- Svelte 5 runes(`$state`, `$derived`, `$effect`). 공유 상태는 `src/lib/*.svelte.js` 모듈에 둔다. export한 `$state`는 재할당할 수 없으므로 배열·객체의 내용을 바꾸는 방식으로 갱신한다.
- 라우트를 추가하면 `src/routes/+layout.svelte`의 `menuItems`에도 등록한다 (예외: `/login`은 등록하지 않는다).
- 색은 하드코딩하지 말고 테마 CSS 변수(`var(--bg-page)` 등)를 쓴다. Tailwind v4.
- 재사용 컴포넌트(팝업 등)는 PascalCase(`DeliverablesPickerModal.svelte`), 스토어·API 모듈은 camelCase(`deliverablesStore.svelte.js`, `api/imgagongPlans.js`).
- API 연동 (FE-1 이후):
  - base URL은 `.env`의 `VITE_API_BASE_URL`(로컬 백엔드 `http://localhost:3001/api`).
  - 세션 쿠키 인증이므로 `fetch`에 `credentials: 'include'`.
  - 요청·응답 필드는 camelCase(`chipSize`, `createdAt` 등) — 프론트에서 변환하지 않는다.
  - 모든 요청은 `src/lib/api/client.js`의 `request(path, { method, query, body })`를 거친다. 4xx/5xx는 `err.status`와 서버 메시지(`err.message`)가 담긴 Error로 던져지고, 네트워크 실패는 원래 TypeError 그대로 전파된다. client는 콘솔에 찍지 않는다(처리·표시는 스토어 책임).
  - 에러 응답은 `{ error: { message } }`. 4xx/5xx는 에러로 던지고 조용히 삼키지 않는다. 401은 각 스토어의 catch에서 `err.status === 401`이면 `authStore`의 `clearUser()`를 호출한다 — 레이아웃이 `auth.user === null`을 보고 `/login?redirectTo=현재경로`로 보낸다. 스토어는 `goto`를 쓰지 않는다.
- `src/lib/parseModuleData.js`, `src/lib/imgagongRow.js`, `src/lib/deliverableRow.js`, `src/lib/xlsxToText.js`, `src/lib/xlsxImage.js`는 Svelte에 의존하지 않는 순수 함수로 유지한다.
- 기존 파일 일부는 2칸 들여쓰기·큰따옴표다. 재포맷은 수정하는 파일에만 한다.
- 주석은 한국어 학습용 설명 스타일(Svelte를 React와 비교 등).

### 확인 명령어 (루트에서)

- `pnpm dev` — Vite 개발 서버(`http://localhost:5173`)
- `pnpm check` — 타입 검사, `pnpm lint` — prettier + eslint
- `pnpm test` — Vitest(`src/lib/**/*.test.js`, 커버리지 80% 미만이면 실패). 대상은 Svelte 비의존 모듈(`src/lib/api` 등)이고, `fetch`는 `vi.stubGlobal`로 가짜로 대체한다. UI/E2E 테스트는 만들지 않는다(`docs/4` 4절).
