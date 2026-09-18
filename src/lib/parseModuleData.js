/**
 * ============================================================
 * parseModuleData.js
 * ============================================================
 * 이 파일은 Svelte에 종속되지 않는 "순수 JS 함수"만 모아둔 파일입니다.
 * React 버전에서 썼던 parseFirstSheet()와 하는 일은 똑같은데,
 * 입력이 "엑셀 파일(binary)"이 아니라 "엑셀에서 복사해서 붙여넣은 텍스트"라는
 * 점만 다릅니다.
 *
 * 왜 이게 가능한가?
 *  엑셀에서 셀 범위를 드래그해서 Ctrl+C 하면, 클립보드에는
 *  "각 셀은 탭(\t)으로 구분, 각 행은 줄바꿈(\n)으로 구분"된
 *  순수 텍스트가 담깁니다. 그래서 <textarea>에 붙여넣기(Ctrl+V)만 하면
 *  이 문자열을 그대로 받을 수 있고, 엑셀 파일을 열지 않고도
 *  똑같은 표 구조를 텍스트로 얻을 수 있는 것입니다.
 *
 * 나중에 Excel 파일을 서버에서 직접 읽는 방식으로 바꿀 때는,
 * "파일을 읽어서 이 형태의 rows 배열을 만드는 부분"만 교체하면 되고
 * 아래 파싱 로직(classifyRows)은 그대로 재사용됩니다.
 * ============================================================
 */

// chip 정보 행의 A열 라벨과, 그 값을 저장할 key 이름을 매핑
const CHIP_INFO_LABELS = {
  "One Shot Size": "oneShotSize",
  "MostOuter ScribeLine Size": "outerScribeSize",
  "Step pitch": "stepPitch",
};

/**
 * 붙여넣은 원본 텍스트(rawText)를 받아서
 * { modules, chip } 형태로 분리해서 반환한다.
 *
 * @param {string} rawText - textarea에 붙여넣어진 원본 문자열
 * @returns {{ modules: Array, chip: Object, warnings: string[] }}
 */
export function parsePastedModuleData(rawText) {
  const warnings = [];

  if (!rawText || !rawText.trim()) {
    return { modules: [], chip: emptyChip(), warnings: ["붙여넣은 데이터가 없습니다."] };
  }

  // 1) 줄 단위로 자르고, 각 줄을 탭 기준으로 셀 단위로 자른다.
  //    \r\n / \r / \n 어떤 개행 방식이든 처리할 수 있도록 정규식 사용.
  const lines = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const modules = [];
  const chip = emptyChip();

  for (const line of lines) {
    if (!line.trim()) continue; // 빈 줄은 건너뜀

    const cells = line.split("\t"); // 엑셀 붙여넣기는 탭으로 셀이 구분됨
    const colA = String(cells[0] ?? "").trim();
    if (!colA) continue;

    // 2) chip 정보 행인지 확인 (One Shot Size / Outer Scribe / Step pitch)
    if (CHIP_INFO_LABELS[colA]) {
      const key = CHIP_INFO_LABELS[colA];
      chip[key] = {
        width: toNumber(cells[1]),
        height: toNumber(cells[2]),
      };
      continue;
    }

    // 3) module 데이터 행인지 확인
    //    엑셀 원본 기준 컬럼 위치: A=이름(0), D=width(3), E=height(4), H=x(7), I=y(8)
    const width = toNumber(cells[3]);
    const height = toNumber(cells[4]);
    const x = toNumber(cells[7]);
    const y = toNumber(cells[8]);

    // 숫자로 정상 변환된 행만 module 데이터로 인정 (헤더 행은 자동으로 걸러짐)
    if ([width, height, x, y].every((v) => v !== null)) {
      modules.push({ name: colA, width, height, x, y });
    }
  }

  if (modules.length === 0) {
    warnings.push("module 데이터를 찾지 못했습니다. 컬럼 위치(A,D,E,H,I)를 확인해주세요.");
  }
  if (!chip.oneShotSize || !chip.outerScribeSize || !chip.stepPitch) {
    warnings.push("One Shot Size / Outer Scribe / Step pitch 중 일부를 찾지 못했습니다.");
  }

  return { modules, chip, warnings };
}

// 숫자 변환 헬퍼: 실패하면 null (0과 구분하기 위해 NaN 대신 null 사용)
function toNumber(v) {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function emptyChip() {
  return { oneShotSize: null, outerScribeSize: null, stepPitch: null };
}
