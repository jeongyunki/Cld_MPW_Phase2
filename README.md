# MPW Plus 2차 개발분

사내 "MPW Plus" 도구에 붙을 2차 기능(Deliverables, MapGen Excel 파일 선택, 임가공 Plan 실시간 공유·의뢰 확정, Master 관리)을 담은 저장소입니다. 프론트엔드와 백엔드가 한 저장소(pnpm 워크스페이스)에 있습니다.

| 영역        | 위치          | 스택                              | 로컬 주소                 |
| ----------- | ------------- | --------------------------------- | ------------------------- |
| 프론트엔드  | `src/` (루트) | SvelteKit (Svelte 5), Tailwind v4 | http://localhost:5173     |
| 백엔드      | `server/`     | Express 5 + Knex + PostgreSQL     | http://localhost:3001/api |
| 목 API 서버 | `mockup/`     | swagger 기반 목 응답              | http://localhost:3000     |

## 화면

| 경로            | 화면         | 비고                                                                                     |
| --------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `/login`        | 로그인       | 비로그인 상태로 다른 화면에 들어오면 이동                                                |
| `/`             | Welcome      | 도구 카드                                                                                |
| `/deliverables` | Deliverables | 차수/공정명/엑셀 파일 등록·검색·다운로드·삭제                                            |
| `/mapgen`       | MapGen Web   | 엑셀 붙여넣기 또는 "Excel 파일 선택"으로 도면 생성 (첫 시트 이미지를 참조 이미지로 사용) |
| `/imgagong`     | 임가공 Plan  | 기간 조회·셀 수정·삭제, 실시간 공유, 충돌 안내, 관리자 의뢰 확정                         |
| `/master`       | Master Page  | dropdown 항목 관리 (관리자 전용)                                                         |

## 처음 실행하기

필요한 것: Node.js 24, pnpm, PostgreSQL

1. 의존성 설치 (루트에서 한 번이면 프론트·백엔드·목 서버 모두 설치)

   ```sh
   pnpm install
   ```

2. 백엔드 준비: DB 생성, `server/.env` 작성, 테이블·초기 데이터 생성은 [`server/README.md`](server/README.md) 1~5절을 따릅니다.

3. 프론트 환경변수: 루트의 `.env.example`을 `.env`로 복사하고 API 주소를 넣습니다.

   ```
   VITE_API_BASE_URL=http://localhost:3001/api
   ```

4. 실행 (터미널 2개, 각각 열어 둔 채로 사용)

   ```sh
   pnpm --filter server dev   # 백엔드 → http://localhost:3001/api/health 가 {"status":"ok"}
   pnpm dev                   # 프론트 → http://localhost:5173 접속
   ```

   로그인 계정은 `server/.env`의 `ADMIN_*`(관리자)와, 값이 있으면 `TEST_USER_*`(일반 사용자)입니다.

## 확인 명령 (루트에서)

| 명령                        | 내용                                                              |
| --------------------------- | ----------------------------------------------------------------- |
| `pnpm test`                 | 프론트 순수 모듈 테스트 (Vitest, 커버리지 80% 미만이면 실패)      |
| `pnpm --filter server test` | 백엔드 테스트 (node:test + supertest, 커버리지 80% 미만이면 실패) |
| `pnpm check`                | 타입 검사 (svelte-check)                                          |
| `pnpm build`                | 프로덕션 빌드                                                     |

## 문서

- 설계 문서: `docs/1`~`8` (도메인정의서 → PRD → 사용자 시나리오 → 구조 원칙 → 아키텍처 → ERD → 실행계획 → 와이어프레임). 진행 상황과 점검 결과는 `docs/7-execution-plan.md`에 있습니다.
- API 스펙: `swagger/swagger.json` (목 서버 실행 시 http://localhost:3000/docs)
- 개발 규칙: `CLAUDE.md`, `src/CLAUDE.md`, `server/CLAUDE.md`
- 개발 과정 발표 자료: `docs/presentation/` — Claude Code로 진행한 22일간의 기록. HTML(발표·타임라인·요청 로그·용어 사전, 인터넷 없이 열림), PowerPoint(발표자 노트·용어 사전 부록 포함), 50분 발표 대본(`presentation-script.md`)

## 현재 상태

실행계획의 모든 Task(DB-1~4, BE-1~7, FE-1~7)와 통합 점검이 끝났습니다. 운영 전에 남은 과제는 배포 방식 결정(현재는 로컬 실행만), 임가공 Plan 필수 필드의 업무 확인, 1차 시스템 인증 연동입니다. SheetJS는 취약점이 고쳐진 `xlsx@0.20.3`(SheetJS CDN)을 씁니다 — npm 레지스트리의 `xlsx`(0.18.5)로 다시 설치하지 마세요.
