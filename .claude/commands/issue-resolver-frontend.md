---
description: 프론트엔드 GitHub 이슈 번호를 받아 서브에이전트로 분석·계획·테스트·구현까지 해결한다
argument-hint: <이슈 번호> (예: 3)
---

# 프론트엔드 Issue 해결 사용자 정의 command

너는 Github issue를 해결하는 유능한 프론트엔드 개발자 이다. Github issue 번호를 Argument로 전달받아 해당 번호의 Issue를 해결해야 한다.

- ISSUE_NUMBER: $ARGUMENTS
- 저장소: `jeongyunki/Cld_MPW_Phase2` (`gh`가 PATH에 없으면 `"C:\Program Files\GitHub CLI\gh.exe"` 사용)
- 프론트엔드 코드베이스: 루트의 SvelteKit 앱 (`src/`, 지침은 `src/CLAUDE.md`)
- 연동 대상 백엔드: `server/` (`http://localhost:3001/api`, 계약은 `swagger/swagger.json`)

### 작업 내용

- 이슈 확인: gh cli 도구를 이용해 Issue 내용과 docs/ 디렉토리의 핵심문서(특히 `docs/8-wireframes.md`)를 읽어와 적절한 서브에이전트를 이용해 분석한다. 선행 이슈가 열려 있으면 진행 여부를 사용자에게 묻는다.
- 자식 브랜치 분기: feature-${ISSUE_NUMBER} 형태의 자식브랜치를 생성한다.
- 기존 코드 분석: 적절한 서브에이전트를 사용해 swagger/swagger.json, 백엔드 API 구현(`server/src`), 프론트엔드 코드베이스(`src/`)를 분석한다.
- 이슈확인, 자식 브랜치 분기, 기존 코드 분석은 병렬로 실행한다.
- 계획 수립: 기존 코드 분석한 결과와 분석된 Issue 내용을 바탕으로 독립적인 서브에이전트를 이용해 Issue 해결 계획을 수립한다.
- 테스트 작성: 수립된 계획을 바탕으로 독립적인 서브에이전트를 이용하여 해결한 Issue를 테스트할 수 있는 커버리지 80%이상의 테스트케이스를 작성한다.
- 문제 해결: 수립된 계획을 바탕으로 프론트엔드 개발에 적합한 서브에이전트를 선택해서 해결한다.
- 테스트 작성과 문제 해결은 병렬로 수행한다.
- 테스트 수행: 독립적인 서브에이전트를 이용해 미리 작성한 테스트를 이용해 테스팅한다. 자동 테스트와 함께 `pnpm check`, 실제 백엔드(3001)와 Vite 개발 서버(5173)를 띄운 화면 동작으로 이슈의 완료 조건을 확인한다.
