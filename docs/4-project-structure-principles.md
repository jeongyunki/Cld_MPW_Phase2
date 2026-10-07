# MPW Plus 2차 개발 프로젝트 구조설계 원칙

> 이 문서는 `docs/1-domain-definition.md`(도메인정의서), `docs/2-PRD.md`(PRD), `docs/3-user-scenario.md`(사용자 시나리오)에서 이미 확정된 내용(기술 스택, 기능 범위, 인증/동시성 방향 등)을 그대로 전제로 삼는다. 이 문서는 그 결정들을 재논의하지 않고, "그 결정을 실제 코드로 옮길 때 어떤 원칙으로 디렉토리/레이어/네이밍/품질/운영을 구성할 것인가"만 다룬다.
>
> 워크플로우상 위치: 도메인정의서 → PRD → 사용자 시나리오 다음, 그리고 이후 진행될 페르소나 정의/ERD 설계/실행계획보다 앞서 참고해야 하는 **구조 원칙 문서**다. ERD는 이 문서의 "코드/네이밍 원칙"과 "백엔드 디렉토리 구조" 절을 전제로 테이블을 설계하고, 실행계획은 이 문서의 레이어 구조를 전제로 API를 구현한다.
>
> 이 문서 자체도 CLAUDE.md의 "오버엔지니어링 금지" 원칙을 따른다. 각 원칙 뒤에는 왜 그렇게 정했는지 이 프로젝트의 규모/목적/제약에 근거한 이유를 한 줄 이상 남긴다.

---

## 1. 최상위 원칙 (모든 스택 공통)

1. **단순성 우선 (오버엔지니어링 금지)**
   요청받지 않은 추상화 계층, 설정 옵션, 확장용 구조를 만들지 않는다. 필요해지는 시점에 그때 만든다.
   *근거*: CLAUDE.md에 이미 명시된 이 저장소의 대원칙이며, 사용자가 백엔드/DB 경험이 없는 학습 목적 프로젝트이므로 구조가 복잡할수록 학습 곡선과 유지보수 부담이 함께 커진다. (예: PRD 6절에서 "멀티 인스턴스+Redis pub/sub은 지금 도입 안 함"으로 결정한 것과 같은 논조.)

2. **관심사 분리, 단 계층은 최소한으로**
   화면(UI), 서버 API, 데이터 저장을 코드 위치와 책임 단위로 명확히 나누되, 계층 자체는 "라우트 → 서비스 → DB 접근" 3단만 둔다. 계층을 더 세분화(예: DTO 매핑 계층, Repository 인터페이스 추상화 등)하지 않는다.
   *근거*: PRD 6절에서 NestJS류의 과한 계층화를 이미 배제하고 Express+Knex를 선택했다. 계층을 나누는 목적은 "코드를 어디서 찾을지 예측 가능하게 하는 것"이지 유연성 극대화가 아니다.

3. **점진적 확장 (미래를 위한 선제적 구조화 금지)**
   지금 필요 없는 기능(멀티 인스턴스, 캐시 레이어, 메시지 브로커, 마이크로서비스 분리 등)을 위한 자리를 미리 마련하지 않는다. PRD가 이미 "Node 단일 프로세스 + SSE로 시작하고, 실측 후 필요하면 Redis pub/sub"이라는 방향을 확정했으므로, 코드 구조도 이 판단을 뒤집지 않는다.
   *근거*: 프로젝트 규모(동시접속 50~100명)와 학습 목적을 고려하면 선제적 확장 구조는 실제로 쓰이지 않을 코드를 유지보수하는 비용만 늘린다.

4. **프론트엔드는 기존 자산이다 — 새로 짜지 않는다**
   `src/routes`, `src/lib`의 기존 구조·컨벤션(스토어는 `*.svelte.js`, 공유 상태는 컴포넌트 밖에 둔다 등)을 존중하고 확장하는 방향으로만 백엔드 연동을 설계한다. 스토어 내부를 `fetch` 호출로 교체하고 페이지 코드는 그대로 두는 것이 목표다(CLAUDE.md에 이미 명시).
   *근거*: 프론트는 이미 동작하는 프로토타입이고, 2차 개발의 핵심 신규 작업은 백엔드다. 프론트를 다시 설계하는 것은 요청받지 않은 범위 확장이다.

5. **1차 시스템과의 향후 병합을 전제로, 결합은 느슨하게**
   2차 개발 완료 후 코드가 1차 개발자에게 전달되어 병합된다(도메인정의서 4절). 따라서 2차 백엔드는 1차 시스템의 내부 구현에 강하게 의존하지 않고, 인증처럼 1단계(자체 구현)에서 2단계(1차 연동)로 나중에 바뀔 부분은 모듈 하나로 격리해 갈아끼우기 쉽게 만든다(PRD 5절 "인증 로직을 별도 모듈화" 방침과 일치).
   *근거*: 병합 시점에 코드를 갈아엎지 않으려면 지금부터 경계를 분명히 해두는 것이 유리하다. 다만 이것도 "인증 모듈 하나만 분리"하는 수준이지, 전체를 플러그인 아키텍처로 만드는 것은 아니다(1번 원칙과 충돌하지 않는 범위).

6. **문서-코드 동기화**
   CLAUDE.md와 이 문서에 적힌 구조 설명이 실제 코드와 달라지면 문서를 갱신한다. 특히 새 라우트를 추가하면 `+layout.svelte`의 `menuItems`에도 반영한다(CLAUDE.md에 이미 있는 규칙).
   *근거*: 이 프로젝트는 학습 목적 문서 체계(도메인정의서→PRD→...)를 갖추고 있어, 문서가 코드와 어긋나면 다음 단계 작업자(ERD/실행계획)가 잘못된 전제로 설계하게 된다.

---

## 2. 의존성/레이어 원칙

### 프론트엔드

```
페이지 (+page.svelte)  →  스토어 (src/lib/*.svelte.js)  →  API 클라이언트 (src/lib/api/*.js)  →  백엔드
```

- 페이지 컴포넌트는 **스토어를 통해서만** 데이터를 읽고 쓴다. 페이지가 `fetch`를 직접 호출하지 않는다.
- 스토어는 **API 클라이언트를 통해서만** 서버와 통신한다. 스토어가 URL 문자열이나 `fetch` 세부사항을 직접 다루지 않고, API 클라이언트 함수(예: `fetchImgagongRows()`, `createImgagongRow(fields)`)를 호출한다.
- 역방향 의존 금지: API 클라이언트가 스토어를 import하거나, 스토어가 페이지 컴포넌트를 import하는 일은 없다.
- `parseModuleData.js`처럼 Svelte에 의존하지 않는 순수 로직은 계속 순수 함수로 유지하고, 어떤 계층에서든 재사용 가능하게 한다.

*근거*: CLAUDE.md가 이미 "스토어가 향후 서버 연동의 유일한 접점"이라고 못박아뒀다. 여기서 한 단계 더 나눠 "스토어 vs API 클라이언트"를 분리하는 이유는, 스토어는 Svelte `$state`(반응형 상태 보관)에 집중하고, API 클라이언트는 순수하게 "서버에 무엇을 요청하는지"만 담당하게 해서 각각의 책임을 좁히기 위함이다. 이 이상으로 계층을 쪼개지 않는다(예: 별도의 "타입 정의 계층", "캐싱 계층"은 지금 만들지 않음).

### 백엔드

```
routes (요청 매핑)  →  controllers (요청/응답 처리)  →  services (업무 로직)  →  db 접근 (Knex 쿼리)  →  PostgreSQL
```

- **routes**: URL과 HTTP 메서드를 controller 함수에 매핑만 한다. 로직을 두지 않는다.
- **controllers**: `req`/`res`를 다루고, 입력값 검증 결과를 바탕으로 service를 호출해 응답을 만든다. SQL이나 Knex 쿼리를 직접 작성하지 않는다.
- **services**: 실제 업무 로직(예: 낙관적 잠금 버전 체크, 권한 규칙, 상태 전이 규칙)을 담는다. `req`/`res`를 모른다 — 어떤 HTTP 프레임워크를 쓰는지와 무관하게 동작해야 한다.
- **db 접근(예: `db/*.js` 또는 각 리소스별 쿼리 모듈)**: Knex 쿼리 빌더로 실제 SQL을 실행한다. 업무 로직을 두지 않는다.
- 역방향 의존 금지: service가 controller나 route를 import하지 않고, db 접근 모듈이 service를 import하지 않는다. 상위 계층만 하위 계층을 알 수 있다.
- 파일 업로드(uploads), SSE 브로드캐스트 같은 인프라성 코드는 service 계층에서 호출하는 별도 모듈(예: `lib/sse.js`, `lib/upload.js`)로 분리해, controller/service가 "SSE가 뭔지" 몰라도 되게 한다.

*근거*: PRD 6절이 이미 Express+Knex를 "초보자 친화적 미니멀 구조"로 선택했다. Repository 패턴이나 DTO, 인터페이스 추상화(NestJS류)는 이 조합에는 과하다 — 대신 "라우트/컨트롤러/서비스/DB" 4단만으로 "이 로직은 어디에 있는가"를 예측 가능하게 만드는 것이 목표다. 인증 미들웨어는 routes와 controller 사이에 끼워지는 별도 모듈로 두어(5절 참고), 자체 구현에서 1차 시스템 인증 연동으로 전환되어도 controller/service 코드는 손대지 않도록 한다(1번 최상위 원칙의 5항과 연결).

---

## 3. 코드/네이밍 원칙

기존 Prettier 설정(탭, 홑따옴표, trailing comma 없음, width 100)과 충돌하지 않는 선에서 아래 컨벤션을 따른다.

| 대상 | 컨벤션 | 예시 | 비고 |
|---|---|---|---|
| SvelteKit 라우트 파일 | SvelteKit 고정 규칙 (`+page.svelte`, `+layout.svelte`) | `src/routes/deliverables/+page.svelte` | 기존 관례 그대로 |
| 프론트 공유 상태 모듈 | camelCase + `.svelte.js` | `deliverablesStore.svelte.js` | 기존 `masterStore.svelte.js`, `imgagongStore.svelte.js`와 동일 패턴 |
| 프론트 API 클라이언트 모듈 | camelCase + `.js`, 리소스명 그대로 | `src/lib/api/deliverables.js` | 스토어와 이름을 맞춰 "어떤 스토어가 어떤 클라이언트를 쓰는지" 바로 알 수 있게 함 |
| 재사용 Svelte 컴포넌트(팝업 등) | PascalCase | `DeliverablesPickerModal.svelte` | 현재 저장소엔 아직 없지만, Svelte 생태계 표준 관례. 라우트 전용 `+page.svelte`와 구분하기 위함 |
| JS 변수/함수명 (프론트/백엔드 공통) | camelCase | `addRow`, `fetchImgagongRows` | 기존 코드와 동일 |
| 백엔드 계층별 파일명 | kebab-case + 계층 접미사 | `imgagong-plans.routes.js`, `imgagong-plans.service.js` | 파일명만 보고 계층을 알 수 있게 함. Express 생태계에서 흔한 관례 |
| REST 엔드포인트(리소스 경로) | 복수형 명사, kebab-case | `/api/imgagong-plans`, `/api/master-items` | PRD 3.5절에 이미 정의된 경로를 그대로 따름 |
| API JSON 필드명(요청/응답 body, 쿼리) | camelCase | `chipSize`, `createdAt`, `fieldName` | JS/Node REST API에서 가장 일반적인 관례. 프론트 코드가 변환 없이 그대로 사용. `swagger/swagger.json`도 이 기준(이슈 #7 결정) |
| PostgreSQL 테이블명 | snake_case, 복수형 | `imgagong_plans`, `master_items`, `deliverables` | PostgreSQL/SQL 관례. API 리소스명(kebab-case)과 1:1 대응되도록 함(`-` → `_`) |
| PostgreSQL 컬럼명 | snake_case | `chip_size`, `created_at`, `pkg_qty` | JS의 camelCase(`chipSize`)와는 계층 경계(DB 접근 모듈)에서만 변환 |
| 공통 컬럼 | `id`(PK), `created_at`, `updated_at`, `version`(낙관적 잠금용) | - | PRD 4.2절 낙관적 잠금, 시나리오 문서의 "수정일시/수정자" 요구를 일관되게 반영 |
| 환경변수 | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `UPLOAD_DIR` | Node.js/dotenv 관례 |

*근거*: 프론트는 기존 파일이 이미 camelCase + `.svelte.js`로 자리잡았으므로 그대로 확장한다. 백엔드는 아직 코드가 없어 새로 정하지만, "파일명만 보고 계층/역할을 유추할 수 있게"가 유일한 목표이며 그 이상의 규칙(예: 계층별 전용 접두사 인터페이스 네이밍 등)은 두지 않는다. DB는 PostgreSQL 관례(snake_case)를 따르고 JS 쪽 camelCase와의 변환은 DB 접근 계층 한 곳에서만 처리해, 위/아래 계층이 서로 다른 네이밍 스타일에 신경 쓰지 않게 한다.

---

## 4. 테스트/품질 원칙

백엔드는 BE-1부터 Node 내장 러너(`node:test`) + `supertest`로 테스트하고, Task마다 커버리지 80% 이상을 요구한다(`pnpm --filter server test`가 80% 미만이면 실패). (출처: 이슈 #2 결정 댓글) 프론트는 FE-1부터 Vitest로 `src/lib`의 Svelte 비의존 모듈을 테스트한다(`pnpm test`, 커버리지 80% 미만이면 실패 — 대상은 `src/lib/api`부터 시작해 이후 이슈마다 넓힌다). (출처: 이슈 #3 결정 댓글)

1. **백엔드는 HTTP 수준 테스트를 허용하되, 실제 PostgreSQL 통합 테스트는 도입하지 않는다.**
   - 백엔드: `supertest`로 `app`에 요청을 보내 상태코드/응답 본문을 검증할 수 있다. services 계층의 업무 로직(낙관적 잠금 버전 체크, 권한 판단, 상태 전이 규칙)은 `req`/`res`나 DB 연결 없이 테스트한다.
   - DB가 필요한 경로는 DB 연결 모듈(`src/db/connection.js`)을 가짜로 대체해서 테스트한다. 실제 DB를 띄우는 통합 테스트, UI 렌더링 테스트, E2E 테스트는 지금 단계에서 도입하지 않는다.
   - 프론트: `src/lib`의 Svelte에 의존하지 않는 모듈(`src/lib/api/*.js`, `parseModuleData.js` 같은 순수 함수)만 테스트 대상으로 삼는다. 네트워크는 `fetch`를 `vi.stubGlobal`로 가짜로 대체하고 실제 백엔드에 요청하지 않는다. 컴포넌트 렌더링(UI) 테스트와 E2E 테스트는 도입하지 않는다.
   *근거*: HTTP 수준 테스트는 인프라 없이도 라우팅·에러 처리·CORS 같은 "배선" 실수를 잡아준다. 실제 DB 통합/E2E는 인프라 준비 비용이 학습 목적 프로젝트 규모에 비해 크다.

2. **테스트 러너는 영역별로 하나씩: 백엔드는 `node:test`, 프론트는 Vitest.**
   서버는 CommonJS + Node 24라서 별도 설정 없이 바로 도는 내장 `node:test`를 유지한다(커버리지 임계값 `--test-coverage-lines` 등도 내장). 프론트는 `import.meta.env`, `$lib` 같은 Vite 전용 기능을 쓰므로 Node 단독으로는 돌릴 수 없다. 그래서 `vite.config.ts`를 그대로 공유하는 Vitest를 쓴다(`test` 블록만 추가하고 별도 설정 파일은 만들지 않음). 테스트 파일은 대상 옆에 `*.test.js`로 둔다.
   *근거*: 1번 최상위 원칙 — 각 영역에서 설정이 가장 적게 드는 러너를 고른다. 프론트에 `node:test`를 쓰려면 Vite 기능을 흉내 내는 설정이 따로 필요해진다.

3. **Lint/format은 지금처럼 커밋 전 수동 실행으로 충분하다.**
   `pnpm lint`(prettier --check + eslint), `pnpm format`을 계속 사용한다. 백엔드 코드가 추가되면 같은 `eslint`/`prettier` 설정 범위에 포함시키되(현재 prettier 설정에 이미 전체 저장소가 대상), 백엔드 전용 별도 룰셋을 새로 만들지 않는다.
   *근거*: 이미 있는 도구를 그대로 확장하는 것이 가장 단순하다. CI 자동화(pre-commit hook, GitHub Actions 등)는 요청받지 않았으므로 지금 도입하지 않는다.

4. **코드 리뷰는 "PR 단위 자기 점검"으로 대체한다.**
   현재 단일 개발자(git 이력 기준) 체제이므로, 정식 리뷰어가 없더라도 기능 단위로 커밋/PR을 쪼개고, 커밋 전 `pnpm check`(타입 검사) + `pnpm lint`를 직접 돌려 확인하는 것을 리뷰 대체 절차로 삼는다. 협업자가 늘어나면 그때 실제 리뷰 프로세스(예: PR 승인 필수화)를 추가한다.
   *근거*: 지금 없는 협업자를 위한 프로세스를 미리 만드는 것은 오버엔지니어링이다. 필요해지는 시점에 추가한다(3번 최상위 원칙).

---

## 5. 설정/보안/운영 원칙

1. **환경변수로 설정을 분리하고, 비밀값은 커밋하지 않는다.**
   - `.env`(로컬 실제 값, git-ignored) / `.env.example`(키 목록만, 커밋 대상) 두 파일을 둔다.
   - 최소 항목: `DATABASE_URL`, `PORT`, `UPLOAD_DIR`, `SESSION_SECRET`(자체 구현 인증용, PRD 5절 1단계 참조).
   - 개발/프로덕션 환경 차이는 "같은 코드, 다른 `.env` 값"으로 처리한다. 별도의 `config/development.js` / `config/production.js` 같은 다중 설정 파일 구조는 지금 필요 없다(환경 차이가 DB 접속 정보, 포트 정도뿐이므로).
   *근거*: PRD 8절에서 "로컬 → 테스트 → 스테이징 → 프로덕션" 환경 분리를 실행계획 단계 과제로 남겼지만, 지금 단계에서 코드 구조는 `.env` 파일 교체만으로 대응 가능하게 해두면 충분하다. 별도 설정 프레임워크(예: `config` npm 패키지)는 과하다.

2. **보안은 PRD 4.3절 요구사항을 그대로 구현 원칙으로 옮긴다.**
   - **사내망 폐쇄 전제**: 공개 인터넷 노출을 가정한 방어(예: 레이트리밋, WAF)는 지금 범위에 넣지 않는다. 다만 입력값 검증과 SQL Injection 방지(Knex의 파라미터 바인딩을 항상 사용, raw SQL 문자열 concat 금지)는 기본으로 지킨다.
   - **권한 검사는 controller 진입 전, 미들웨어에서 한 번**: 라우트마다 개별적으로 권한 로직을 흩어놓지 않고, `requireAuth`, `requireAdmin` 같은 미들웨어를 라우트 정의에 명시적으로 붙이는 방식으로 통일한다.
   - **HTTPS**: 로컬 개발에서는 HTTP로 충분하지만, 배포 환경에서는 리버스 프록시(사내 인프라)가 HTTPS를 종단(termination)하는 것을 전제로 하고, 애플리케이션 코드 자체에는 TLS 처리를 넣지 않는다.
   *근거*: PRD가 이미 "사내망 폐쇄 환경"을 전제로 보안 요구사항을 완화해뒀다. 그 전제를 넘어서는 보안 장치(공개 서비스 수준의 방어)를 코드에 미리 넣는 것은 불필요한 복잡도다.

3. **로깅은 "무슨 일이 있었는지 나중에 추적 가능한 최소 수준"으로 시작한다.**
   HTTP 요청 로그(예: `morgan` 같은 가벼운 미들웨어) + 에러 발생 시 스택 트레이스를 콘솔/파일에 남기는 정도로 시작한다. ELK, APM 같은 별도 모니터링 스택은 지금 도입하지 않는다.
   *근거*: PRD 4.3절도 "감시/감사는 후순위"로 명시했다. 로그 인프라를 지금 구축하는 것은 현재 규모와 학습 목적에 비해 과하다.

4. **백업은 운영 정책 문서로 남기고, 코드는 이를 방해하지 않게만 짠다.**
   PostgreSQL 백업(예: `pg_dump` cron)과 업로드 파일 백업은 실행계획/배포 단계의 인프라 작업이지, 애플리케이션 코드 구조에 포함되지 않는다. 다만 업로드 파일 경로(`UPLOAD_DIR`)를 환경변수로 분리해두면 백업 대상 디렉토리를 바꾸기 쉬워진다(1번 항목과 연결).
   *근거*: PRD 4.4절도 백업을 "운영 정책으로 처리, 구현 세부사항은 배포/인프라 단계"로 명시했다. 이 문서(코드 구조 원칙)에서 더 깊이 다루지 않는다.

---

## 6. 디렉토리 구조

### 6.1 프론트엔드 (기존 구조 확장)

기존 `src/routes`, `src/lib` 구조를 그대로 유지하고, Deliverables Page(신규 라우트)와 API 클라이언트 계층만 추가한다.

```
src/
├── routes/
│   ├── +layout.svelte          # 기존 — menuItems에 Deliverables 메뉴 추가 필요
│   ├── +page.svelte            # 기존 (Welcome)
│   ├── mapgen/
│   │   └── +page.svelte        # 기존 — FR-MG-02(파일 선택 팝업) 추가 예정
│   ├── imgagong/
│   │   └── +page.svelte        # 기존 — 백엔드 연동으로 내부만 교체
│   ├── master/
│   │   └── +page.svelte        # 기존 — 백엔드 연동으로 내부만 교체
│   └── deliverables/            # 신규 라우트 (도메인정의서/PRD 신규 기능)
│       └── +page.svelte
│
└── lib/
    ├── assets/                  # 기존
    ├── masterStore.svelte.js    # 기존 — 내부 구현만 fetch로 교체
    ├── imgagongStore.svelte.js  # 기존 — 내부 구현만 fetch로 교체
    ├── deliverablesStore.svelte.js  # 신규 — 위 두 스토어와 동일 패턴
    ├── theme.svelte.js          # 기존, 변경 없음
    ├── parseModuleData.js       # 기존, 변경 없음 (순수 로직)
    └── api/                     # 신규 — API 클라이언트 계층 (2절 참고)
        ├── client.js            # fetch 공통 래퍼 (base URL, 에러 처리 등 최소 공통 로직만)
        ├── deliverables.js
        ├── imgagongPlans.js
        └── masterItems.js
```

- FE-1(이슈 #3)에서는 `client.js`(공통 `request` 함수)와 리소스 모듈 3개, 같은 폴더의 `*.test.js`만 만든다. `auth.js`는 FE-2(#8), `sse.js`는 FE-6B(#16)에서 추가한다.
- `src/lib/api/*`가 백엔드 REST 엔드포인트와 1:1로 대응한다(예: `imgagongPlans.js` ↔ `/api/imgagong-plans`).
- 각 스토어(`*.svelte.js`)는 대응하는 `api/*.js` 모듈만 import한다(2절 의존성 원칙).
- SSE 구독(실시간 반영)이 필요한 스토어(`imgagongStore.svelte.js`, `masterStore.svelte.js`)는 `api/client.js` 옆에 `api/sse.js` 하나를 추가해 `EventSource` 연결을 공유하는 정도로 충분하다(스토어별로 각자 연결을 열지 않음).

*근거*: 기존 라우트/스토어 구조를 그대로 두어 CLAUDE.md의 아키텍처 설명과 충돌하지 않게 했다. `lib/api`만 새로 추가해 "스토어는 상태 관리, api는 통신"이라는 책임을 분리했다.

### 6.2 백엔드 (신규 제안)

Express + Knex 기준, 2절의 "routes → controllers → services → db 접근" 원칙을 그대로 반영한다. 저장소 루트에 `server/` 디렉토리로 프론트(`src/`)와 분리한다(하나의 pnpm 워크스페이스 안에 두 애플리케이션을 두는 가장 단순한 형태 — 별도 레포/모노레포 도구는 지금 불필요).

아래 트리의 `knexfile.js`/`db/migrations/`는 Knex 내장 마이그레이션 기능을 잠정 기본값으로 가정한 것이다. 마이그레이션 도구 자체(Knex migrations vs Flyway vs Liquibase)는 PRD 9절에 여전히 "미정, 차기 회의 협의 대상"으로 남아있으니, 최종 선택이 달라지면 이 두 파일/폴더만 교체하면 된다.

```
server/
├── package.json                 # 백엔드 전용 의존성 (express, knex, pg 등)
├── knexfile.js                  # Knex 연결/마이그레이션 설정 (dev/production 환경 분기)
├── .env.example
│
├── src/
│   ├── app.js                   # Express 앱 조립 (미들웨어, 라우트 등록)
│   ├── server.js                # HTTP 서버 시작점 (app.js를 listen)
│   │
│   ├── db/
│   │   ├── connection.js        # Knex 인스턴스 생성
│   │   ├── migrations/          # Knex 마이그레이션 (테이블 스키마, ERD 단계에서 채워짐)
│   │   └── seeds/               # 초기 데이터 (master_items 초기값, 관리자 계정)
│   │
│   ├── auth/                    # 로그인/로그아웃/내 정보 (passport 설정은 middleware/auth.js)
│   │   ├── auth.routes.js
│   │   ├── auth.controller.js
│   │   ├── auth.service.js      # bcryptjs 비밀번호 비교
│   │   └── auth.repository.js   # users 조회
│   │
│   ├── deliverables/            # 리소스(도메인) 단위로 라우트/컨트롤러/서비스를 묶음
│   │   ├── deliverables.routes.js
│   │   ├── deliverables.controller.js
│   │   ├── deliverables.service.js
│   │   └── deliverables.repository.js   # Knex 쿼리 (DB 접근 계층)
│   │
│   ├── imgagong-plans/
│   │   ├── imgagong-plans.routes.js
│   │   ├── imgagong-plans.controller.js
│   │   ├── imgagong-plans.service.js    # 낙관적 잠금 버전 체크 등 업무 로직
│   │   └── imgagong-plans.repository.js
│   │
│   ├── master-items/
│   │   ├── master-items.routes.js
│   │   ├── master-items.controller.js
│   │   ├── master-items.service.js
│   │   └── master-items.repository.js
│   │
│   ├── middleware/
│   │   ├── auth.js               # requireAuth / requireAdmin (1단계: Passport.js 자체 구현, 2단계: 1차 인증 연동으로 교체 예정, 5절 참고)
│   │   └── errorHandler.js       # 공통 에러 응답 포맷
│   │
│   ├── lib/
│   │   ├── upload.js             # 파일 업로드 처리 (multer 등), 로컬 파일시스템 저장 경로 관리
│   │   └── sse.js                # SSE 연결 관리 + 브로드캐스트 (imgagong-plans, master-items가 호출)
│   │
│   └── routes.js                 # 위 리소스별 router들을 모아 app.js에 한 번에 등록
│
└── uploads/                      # 로컬 파일시스템 저장소 (deliverables 엑셀 파일), git-ignored
    └── deliverables/
```

- 각 리소스 폴더(`deliverables/`, `imgagong-plans/`, `master-items/`)가 라우트명(=API 경로, =DB 테이블명과 대응)과 이름을 맞춰, "이 리소스 관련 코드는 어디 있는가"를 즉시 알 수 있게 한다.
- `middleware/auth.js` 하나에 인증 방식을 격리해, PRD 5절의 "1단계 Passport.js 자체 구현 → 2단계 1차 시스템 인증 전환" 결정이 실행되어도 이 파일만 교체하면 되게 한다(1절 5번 원칙과 직결).
- `lib/sse.js`는 PRD 6절의 "Node 단일 프로세스 + SSE" 결정을 그대로 반영한 것으로, 커넥션을 메모리 배열/맵으로 관리하는 단일 모듈이다. 나중에 Redis pub/sub이 필요해지면 이 파일 내부만 교체한다.
- 리소스별 폴더 구조는 "기능(도메인) 단위 묶음"이며, `routes/`, `controllers/`, `services/` 같은 계층별 최상위 폴더로 전체를 나누지 않는다 — 리소스 3~4개뿐인 지금 규모에서는 계층별로 폴더를 나누면 관련 파일이 여러 폴더에 흩어져 오히려 찾기 어렵다.

*근거*: 백엔드는 아직 코드가 없으므로 자유롭게 제안했지만, 2절의 레이어 원칙(라우트→컨트롤러→서비스→DB 접근, 역방향 의존 금지)을 그대로 지키는 가장 단순한 배치를 택했다. 리소스 3개(Deliverables/임가공Plan/Master) + 인증/업로드/SSE라는 적은 모듈 수를 고려하면, 계층별 전역 폴더보다 리소스별 폴더가 더 예측 가능하고 파일 수도 적다.
