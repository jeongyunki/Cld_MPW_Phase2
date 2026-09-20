# CLAUDE.md

이 파일은 Claude Code(claude.ai/code)가 이 저장소에서 작업할 때 참고할 안내서입니다.

## 작업 규칙

- **모든 대화는 한국어로 한다.** (답변, 설명, 질문, 요약 모두 해당)
- **오버엔지니어링 금지.** 요청받은 것만 가장 단순한 방식으로 구현한다. 요청하지 않은 추상화, 설정 옵션, 확장용 구조, 방어 코드, 미래를 대비한 일반화를 추가하지 않는다. 필요해지는 시점에 그때 만든다.

## 명령어

패키지 매니저는 **pnpm**입니다 (`.npmrc`에 `engine-strict=true`).

- `pnpm dev` — Vite 개발 서버
- `pnpm build` / `pnpm preview` — 프로덕션 빌드 / 미리보기
- `pnpm check` — `svelte-kit sync` + `svelte-check` (타입 검사)
- `pnpm check:watch` — 위 타입 검사를 watch 모드로 실행
- `pnpm lint` — `prettier --check . && eslint .`
- `pnpm format` — `prettier --write .`

테스트 러너는 설정되어 있지 않습니다.

## 개요

"MPW Console" — SvelteKit 기반 사내 도구 앱입니다 (Svelte 5 runes, Tailwind v4, `adapter-auto`). **클라이언트 전용 프로토타입**으로, 백엔드가 없고 모든 데이터는 브라우저 메모리에만 있습니다 (새로고침하면 사라짐). 코드 주석과 UI 문구는 한국어이며, 주석은 학습용 설명 형태(예: Svelte를 React와 비교)로 쓰여 있습니다. 이 저장소의 새 코드도 같은 스타일을 따릅니다.

라우트는 4개이며, `src/routes/+layout.svelte`의 `menuItems` 배열에 등록되어 있습니다 (라우트를 추가할 때는 여기에 메뉴 항목도 추가할 것):

- `/` Welcome
- `/mapgen` MapGen Web — 엑셀 셀(탭으로 구분된 텍스트)을 붙여넣어 파싱하고, 칩 이미지 위에 module 사각형 / sawing line / 치수 화살표를 `<canvas>`로 그림 (약 1200줄짜리 단일 페이지 컴포넌트)
- `/imgagong` 임가공 Plan — 계획 행 테이블 (추가 팝업, 기간 필터, 삭제)
- `/master` Master Page — 임가공 Plan에서 쓰는 dropdown 항목을 추가/삭제

## 아키텍처

**공유 상태는 컴포넌트가 아니라 `src/lib/*.svelte.js` 모듈에 둡니다.** `.svelte.js` 확장자 덕분에 컴포넌트 밖에서도 `$state`를 쓸 수 있습니다. 모듈 수준 상태는 페이지 이동 후에도 유지됩니다 (SvelteKit은 이동 시 페이지 컴포넌트를 새로 만들기 때문에, 컴포넌트 내부의 `$state`는 초기화됨).

- `masterStore.svelte.js` — `masterData`(dropdown 항목 목록) + `MASTER_FIELDS` 메타데이터. Master Page가 쓰고, 임가공 Plan이 읽는다. 단, `status` 목록은 Master Page에서 편집할 수 있지만 `addRow`는 status를 항상 `'new'`로 고정하므로 새 행에는 반영되지 않는다.
- `imgagongStore.svelte.js` — `imgagongRows`와 `addRow` / `deleteSelectedRows`. `addRow`가 `date`(생성 시각, `YYYY-MM-DD HH:MM`)와 `status: 'new'`를 직접 채운다. 페이지의 기간 필터는 `date.slice(0, 7)`을 문자열로 비교한다. 행의 `_selected`는 UI 전용 체크박스 상태다.
- `theme.svelte.js` — 다크/라이트 모드. `+layout.svelte`가 `<html>`에 `light` class를 붙였다 뗀다. 두 팔레트는 레이아웃의 `<style>`에 CSS 변수(`--bg-page` 등)로 정의되어 있다. 테마가 동작하려면 페이지에서 색을 하드코딩하지 말고 `var(--xxx)`를 써야 한다.

이 스토어들이 향후 서버 연동의 유일한 접점입니다 (스토어 내부를 `fetch`로 교체하고, 페이지 코드는 그대로 두는 방식).

`src/lib/parseModuleData.js`는 Svelte에 의존하지 않는 순수 JS입니다. 붙여넣은 엑셀 텍스트를 파싱합니다: A열 = 이름, D/E열 = width/height, H/I열 = x/y. `One Shot Size`, `MostOuter ScribeLine Size`, `Step pitch` 라벨이 붙은 행은 chip 정보가 됩니다. 네 개의 숫자 셀이 모두 변환되는 행만 module로 인정합니다 (이 방식으로 헤더 행이 걸러짐).

## 규칙

- Prettier: 탭, 작은따옴표, 후행 쉼표 없음, 폭 100, Svelte/Tailwind 플러그인 사용 (Tailwind class 정렬은 `src/routes/layout.css`를 참조). 단, 기존 `src/lib`와 `src/routes` 파일 일부는 2칸 들여쓰기와 큰따옴표로 작성되어 있어 `pnpm lint`(`prettier --check`)가 경고를 낼 수 있습니다. 재포맷 diff가 허용될 때만, 수정하는 파일에 한해 `pnpm format`을 실행하세요.
- `static/`은 prettier 대상에서 제외됩니다. MapGen은 기본으로 `/sample/chip.png`(즉 `static/sample/chip.png`)를 사용하는데, 이 파일은 커밋되어 있지 않습니다 — 사용자가 이미지를 선택하거나 이 파일을 추가하기 전까지 canvas는 비어 있습니다.
