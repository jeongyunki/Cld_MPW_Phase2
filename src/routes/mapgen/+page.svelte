<script>
  // parseModuleData.js에서 순수 파싱 함수를 가져온다.
  // (프로젝트에 넣을 때는 보통 src/lib 아래에 두고 "$lib/parseModuleData.js"로 import)
  import { parsePastedModuleData } from '$lib/parseModuleData.js';
  import { onMount } from 'svelte';

  // ------------------------------------------------------------------
  // [코드 위치 안내 1] 선 굵기 조절
  // Step Pitch 화살표 / sawing line(빨간 4선) / sawing 구간 체인 화살표의
  // 굵기를 여기 숫자 3개만 바꾸면 전체에 반영된다. (단위: px)
  // ------------------------------------------------------------------
  const STEP_PITCH_LINE_WIDTH = 7; // 위/왼쪽 Step Pitch 화살표 굵기
  const SAWING_LINE_WIDTH = 5;     // module 상하좌우 빨간 sawing line 굵기
  const CHAIN_LINE_WIDTH = 5;      // 오른쪽/아래쪽 sawing 구간 체인 화살표 굵기

  // ------------------------------------------------------------------
  // Svelte 5의 반응형 상태(rune) 선언부.
  // React의 useState(초기값) 과 하는 역할은 동일하다.
  //   React:  const [pastedText, setPastedText] = useState("")
  //   Svelte: let pastedText = $state("")
  // 차이점: Svelte는 "setter 함수"가 따로 없고, 그냥 변수에 대입하면
  //         (pastedText = "새값") 화면이 자동으로 갱신된다.
  // ------------------------------------------------------------------

  let pastedText = $state('');        // textarea에 붙여넣은 원본 텍스트
  let modules = $state([]);           // 파싱된 module 목록
  let chip = $state(null);            // chip 정보 (One Shot / Outer Scribe / Step pitch)
  let warnings = $state([]);          // 파싱 중 발견된 경고 메시지들
  let innerScribeX = $state(80);      // Inner Scribe Line - inner_width (module 간 x 간격)
  let innerScribeY = $state(80);      // Inner Scribe Line - inner_height (module 간 y 간격)
  let innerMarginWidth = $state(0);   // inner_margin_width - 입력 없으면 0으로 처리
  let innerMarginHeight = $state(0);  // inner_margin_height - 입력 없으면 0으로 처리

  let moduleSelectionInput = $state(''); // 사용자가 입력하는 module명 목록, 예: "M01, M02, M03"
  let selectedModuleNames = $state([]);  // 실제 매칭된 전체 module명 (예: "MAIN_M01")
  let selectionWarnings = $state([]);    // 매칭 안 된 입력값 경고
  let sawingWarnings = $state([]);       // sawing line 겹침/영역이탈 경고

  // ------------------------------------------------------------------
  // [코드 위치 안내 2] "Image 편집" 모드 관련 상태
  // editMode를 켜면 오른쪽/아래쪽 길이 숫자와 No Sawing Line을
  // 마우스로 드래그해 옮길 수 있다. labelFontSize/labelBold는
  // 그 숫자들의 글꼴 크기/굵기를 한번에 조절하는 공통 옵션.
  // labelOffsets는 { "라벨id": {dx, dy} } 형태로, 사용자가 드래그한
  // 만큼의 이동량(px, canvas 내부 좌표 기준)을 라벨별로 기억한다.
  // ------------------------------------------------------------------
  let editMode = $state(false);
  let labelFontSize = $state(17); // sawing/module 간격 체인 숫자의 font 크기 (선택 module 라벨 font와는 독립적)
  let labelBold = $state(true);
  let labelOffsets = $state({}); // { [id]: {dx, dy} } - 체인 숫자 위치 오프셋과 선택 module 라벨 위치 오프셋을 함께 담음 (id 접두사로 구분: "x-", "y-", "mod-")
  let moduleLabelFontSize = $state(20); // 선택 module 사각형 안의 흰색 글씨(M01 등) font 크기 - labelFontSize와 별개로 조절

  // No Sawing Line (녹색 점선) 관련 상태
  let noSawingH = $state(false); // 아래쪽(가로) 점선 on/off
  let noSawingV = $state(false); // 오른쪽(세로) 점선 on/off
  let noSawingHOffset = $state({ base: 15, drag: 0 }); // image 아래 끝에서부터 거리 (기본값 + 드래그로 조정한 값)
  let noSawingVOffset = $state({ base: 15, drag: 0 }); // image 오른쪽 끝에서부터 거리

  // drawOverlay가 그릴 때마다 "현재 화면에 그려진 라벨들의 위치"를 여기 담아둔다.
  // editMode일 때 이 배열을 기준으로 드래그 가능한 투명 손잡이(overlay)를 그 위에 겹쳐 그린다.
  let chainLabelPositions = $state([]); // [{id, x, y, text, color}, ...] (canvas 내부 px 좌표)

  // No Sawing Line(점선)을 편집 모드에서 드래그할 수 있도록,
  // 그려진 점선의 위치(캔버스 내부 좌표)를 여기 저장해둔다.
  let noSawingHLinePos = $state(null); // { x1, x2, y }
  let noSawingVLinePos = $state(null); // { y1, y2, x }

  // canvas의 "실제 해상도"와 "화면에 보이는 크기"의 비율.
  // 편집 모드의 드래그 손잡이를 canvas 위 정확한 위치에 겹쳐 그리려면
  // 이 비율로 좌표를 변환해야 한다. (canvas는 CSS로 max-width:100%로 줄어들 수 있어서)
  let displayScale = $state(1);

  // 개발 중에는 static/sample/chip.png를 기본 이미지로 계속 사용한다.
  // (프로젝트 완성 전까지 매번 파일을 다시 선택하지 않아도 되도록)
  // static 폴더에 넣은 파일은 경로 그대로 URL이 되므로 "/sample/chip.png"로 접근 가능.
  let imageUrl = $state('/sample/chip.png'); // 사용자가 불러온 로컬 이미지의 미리보기 URL
  let imageFileName = $state('chip.png (기본 샘플 이미지)'); // 불러온 이미지 파일명 표시용

  // ------------------------------------------------------------------
  // $effect: 특정 상태(state)가 바뀔 때마다 자동으로 실행되는 코드 블록.
  // React의 useEffect(() => {...}, [pastedText])와 비슷하지만,
  // 의존성 배열을 직접 안 적어도 함수 안에서 읽은 state를 Svelte가
  // 자동으로 추적해서 "pastedText가 바뀌면 다시 실행"해준다.
  // 그래서 "파싱하기" 버튼 없이도 붙여넣는 즉시 아래 테이블이 갱신된다.
  // ------------------------------------------------------------------
  $effect(() => {
    const result = parsePastedModuleData(pastedText);
    modules = result.modules;
    chip = result.chip;
    warnings = result.warnings;
  });

  // module 선택 입력창의 "파싱하기" 버튼을 눌렀을 때 실행.
  // "M01, M02" 같은 짧은 이름을 실제 module명 "MAIN_M01"과 매칭해서
  // 결과 테이블에서 배경색으로 표시할 수 있게 selectedModuleNames를 채운다.
  function handleModuleSelect() {
    const tokens = moduleSelectionInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    const matched = [];
    const notFound = [];

    for (const token of tokens) {
      // 사용자는 "M01"처럼 짧게 입력하지만 실제 데이터의 이름은 "MAIN_M01" 형태이므로
      // 앞에 "MAIN_"을 붙여서 비교한다.
      const fullName = `MAIN_${token}`;
      const found = modules.some((m) => m.name === fullName);
      if (found) {
        matched.push(fullName);
      } else {
        notFound.push(token);
      }
    }

    // 혹시 같은 module을 두 번 입력했을 경우를 대비해 중복을 제거한다
    // (중복이 남아있으면 같은 사각형이 같은 자리에 두 번 그려져서
    //  "여러 개를 선택했는데 하나만 보인다"처럼 보일 수 있다)
    selectedModuleNames = [...new Set(matched)];
    selectionWarnings = notFound.length > 0 ? [`다음 module을 찾지 못했습니다: ${notFound.join(', ')}`] : [];
  }

  // 이미지 파일을 선택했을 때 실행.
  // Excel의 embedded image 대신, 사용자가 image 폴더에서 직접 파일을 골라 불러온다.
  // (나중에 Excel 임베디드 이미지 추출 기능이 준비되면 이 부분만 교체하면 된다.)
  function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    imageFileName = file.name;

    // 이전 이미지가 static 폴더의 고정 경로(/sample/...)가 아니라
    // 사용자가 직접 선택해서 만들어진 임시 URL(blob:...)일 때만 해제한다.
    if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);

    // 로컬 파일을 브라우저에서 바로 보여줄 수 있는 임시 URL로 변환
    imageUrl = URL.createObjectURL(file);
  }

  // ------------------------------------------------------------------
  // [코드 위치 안내 2-계속] 드래그로 라벨 위치를 옮기는 로직.
  // pointerdown이 시작되면 window에 pointermove/pointerup을 붙여서
  // 마우스(또는 터치)가 움직이는 만큼 labelOffsets[id]를 갱신한다.
  // displayScale로 나누는 이유: 화면에 보이는 픽셀 이동량을
  // canvas 내부 실제 좌표 이동량으로 환산하기 위해서다.
  // ------------------------------------------------------------------
  function startLabelDrag(event, id) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const base = labelOffsets[id] || { dx: 0, dy: 0 };

    function onMove(ev) {
      const dx = base.dx + (ev.clientX - startX) / displayScale;
      const dy = base.dy + (ev.clientY - startY) / displayScale;
      // 객체를 통째로 새로 만들어야 Svelte가 변경을 감지한다 (불변 업데이트)
      labelOffsets = { ...labelOffsets, [id]: { dx, dy } };
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // No Sawing Line(점선) 드래그: 이 선들은 image 가장자리와 수직/수평 한 방향으로만
  // 움직이면 되므로, 각각 세로 이동량(H)/가로 이동량(V)만 갱신한다.
  function startNoSawingHDrag(event) {
    event.preventDefault();
    const startY = event.clientY;
    const baseDrag = noSawingHOffset.drag;
    function onMove(ev) {
      noSawingHOffset = { ...noSawingHOffset, drag: baseDrag + (ev.clientY - startY) / displayScale };
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startNoSawingVDrag(event) {
    event.preventDefault();
    const startX = event.clientX;
    const baseDrag = noSawingVOffset.drag;
    function onMove(ev) {
      noSawingVOffset = { ...noSawingVOffset, drag: baseDrag + (ev.clientX - startX) / displayScale };
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // [코드 위치 안내 4] 위치 초기화(reset).
  // 드래그로 옮긴 모든 라벨(체인 숫자 + 선택 module 텍스트)과
  // No Sawing Line의 위치를 "파싱하기"를 처음 눌렀을 때의 기본 위치로 되돌린다.
  // font 크기/굵기, No Sawing Line on/off 여부는 "위치"가 아니므로 그대로 둔다.
  function resetLabelPositions() {
    labelOffsets = {};
    noSawingHOffset = { ...noSawingHOffset, drag: 0 };
    noSawingVOffset = { ...noSawingVOffset, drag: 0 };
  }

  // <canvas> DOM 엘리먼트에 대한 참조. bind:this로 연결한다.
  // React의 useRef(null) + <div ref={...}>와 같은 역할.
  let canvasEl;

  // ------------------------------------------------------------------
  // 이미지 위에 사각형/화살표를 그리는 effect.
  // imageUrl, modules, chip, selectedModuleNames 중 하나라도 바뀌면
  // 캔버스를 다시 그린다.
  //
  // 주의: new Image()의 onload 콜백은 "나중에(비동기로)" 실행되기 때문에,
  // 그 안에서 modules/chip 등을 읽으면 Svelte가 의존성으로 추적하지 못한다.
  // 그래서 effect 본문 맨 앞에서 한 번씩 값을 읽어(_모듈 등) 동기적으로
  // "이 값이 바뀌면 다시 실행해라"라고 등록해준다.
  // ------------------------------------------------------------------
  $effect(() => {
    const _modules = modules;
    const _chip = chip;
    const _selected = selectedModuleNames;
    const _url = imageUrl;
    const _innerX = innerScribeX;
    const _innerY = innerScribeY;
    // 아래 값들이 바뀔 때도(라벨을 드래그하거나, font 옵션을 바꾸거나,
    // No Sawing Line을 켜거나 옮길 때) 다시 그려야 하므로 동기적으로 읽어 등록한다.
    const _labelOffsets = labelOffsets;
    const _fontSize = labelFontSize;
    const _bold = labelBold;
    const _moduleLabelFontSize = moduleLabelFontSize;
    const _noSawingH = noSawingH;
    const _noSawingV = noSawingV;
    const _noSawingHOffset = noSawingHOffset;
    const _noSawingVOffset = noSawingVOffset;

    if (!_url || !canvasEl) return;

    const img = new Image();
    img.onload = () => {
      drawOverlay(img, _modules, _chip, _selected, Number(_innerX) || 0, Number(_innerY) || 0, {
        labelOffsets: _labelOffsets,
        fontSize: _fontSize,
        bold: _bold,
        moduleLabelFontSize: _moduleLabelFontSize,
        noSawingH: _noSawingH,
        noSawingV: _noSawingV,
        noSawingHOffset: _noSawingHOffset,
        noSawingVOffset: _noSawingVOffset,
      });
      // 그리기가 끝난 직후 화면 표시 비율을 갱신 (편집 모드 드래그 손잡이 위치 계산용)
      displayScale = canvasEl.clientWidth / canvasEl.width || 1;
    };
    img.src = _url;
  });

  // canvas 크기가 바뀔 때마다(창 크기 변경 등) displayScale을 다시 계산한다.
  onMount(() => {
    if (!canvasEl) return;
    const ro = new ResizeObserver(() => {
      displayScale = canvasEl.clientWidth / canvasEl.width || 1;
    });
    ro.observe(canvasEl);
    return () => ro.disconnect();
  });

  /**
   * 이미지 + module 사각형 + sawing line + 치수선(화살표)을 canvas에 그린다.
   * @param {HTMLImageElement} img - 로드가 끝난 이미지
   * @param {Array} modulesList - 파싱된 전체 module 목록
   * @param {Object} chipData - chip 정보 (oneShotSize, outerScribeSize, stepPitch)
   * @param {string[]} selectedNames - 사각형으로 표시할 module의 전체 이름들 (예: "MAIN_M01")
   * @param {number} innerX - Inner Scribe Line의 x 간격 (module 간 x 여백)
   * @param {number} innerY - Inner Scribe Line의 y 간격 (module 간 y 여백)
   * @param {Object} opts - 편집 모드 관련 옵션 (labelOffsets, fontSize, bold, noSawingH/V, noSawingHOffset/VOffset)
   */
  function drawOverlay(img, modulesList, chipData, selectedNames, innerX, innerY, opts) {
    const ctx = canvasEl.getContext('2d');
    const labels = []; // 이번 그리기에서 만들어진 라벨들 (편집 모드 드래그 손잡이용으로 마지막에 저장)

    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    // 여백 설계: 상/좌엔 Step Pitch 화살표 1줄, 우/하엔 sawing/module 체인 1줄이 들어간다.
    const PAD = 40;
    const TOP_EXTRA = 70;    // 상단: Step Pitch width 화살표
    const LEFT_EXTRA = 70;   // 좌측: Step Pitch height 화살표
    const RIGHT_EXTRA = 90;  // 우측: height 방향 sawing/module 체인
    const BOTTOM_EXTRA = 90; // 하단: width 방향 sawing/module 체인
    const OVERSHOOT = 20;    // sawing line을 image보다 더 길게 뻗치는 여유분

    const topMargin = PAD + TOP_EXTRA;
    const leftMargin = PAD + LEFT_EXTRA;
    const rightMargin = PAD + RIGHT_EXTRA;
    const bottomMargin = PAD + BOTTOM_EXTRA;

    const canvasWidth = leftMargin + imgWidth + rightMargin;
    const canvasHeight = topMargin + imgHeight + bottomMargin;

    canvasEl.width = canvasWidth;
    canvasEl.height = canvasHeight;

    // 1) 배경 흰색 채우기
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2) 원본 이미지 그리기
    ctx.drawImage(img, leftMargin, topMargin, imgWidth, imgHeight);

    // chip 정보(One Shot / Outer Scribe / Step Pitch)가 아직 없으면
    // 여기서 멈춘다 — 이미지만 먼저 보여주고, Excel 데이터가 들어오면
    // 이 effect가 다시 실행되어 아래 내용이 마저 그려진다.
    if (!chipData || !chipData.oneShotSize || !chipData.outerScribeSize || !chipData.stepPitch) {
      sawingWarnings = [];
      chainLabelPositions = [];
      noSawingHLinePos = null;
      noSawingVLinePos = null;
      return;
    }

    // 3) 스케일 계산
    //    핵심 수정 사항: 이 image가 실제로 표현하는 물리적 전체 크기는
    //    One Shot Size가 아니라 "Step Pitch(=One Shot + Outer Scribe)"이다.
    //    (기존 Python 코드의 remap 공식이 x + oneShot/2 + outerScribe/2 인 것도
    //     결국 x + stepPitch/2 와 같은 의미이고, 이는 "이미지 전체가 stepPitch 크기"
    //     라는 뜻이기 때문이다.) 여기서 스케일 기준을 잘못 잡았던 것이 지난번
    //     좌표가 어긋났던 원인이다.
    const scaleX = imgWidth / chipData.stepPitch.width;
    const scaleY = imgHeight / chipData.stepPitch.height;

    // Inner Scribe Line의 절반 (module과 sawing line 사이 간격, 픽셀 단위)
    const halfInnerXpx = (innerX / 2) * scaleX;
    const halfInnerYpx = (innerY / 2) * scaleY;

    // 이미지 영역의 픽셀 경계 (벗어남 검사에 사용)
    const imgLeft = leftMargin;
    const imgRight = leftMargin + imgWidth;
    const imgTop = topMargin;
    const imgBottom = topMargin + imgHeight;

    const cutBoxes = []; // 겹침/이탈 검사를 위해 module별 sawing 영역을 모아둔다
    const outOfBoundsNames = [];

    // 4) 선택된 module마다 위치 계산 -> 사각형 그리기 -> sawing line 그리기 -> module size 표시
    //
    // [버그 수정] 예전엔 modulesList.find(...)로 "이름이 같은 module 중 첫 번째"만
    // 찾아서 그렸다. 그런데 실제 데이터에는 같은 이름(예: MAIN_M03)이 서로 다른
    // 좌표에 2개 이상 있을 수 있어서, "M03"을 선택하면 그 전부가 그려져야 한다.
    // find() -> 이름이 같은 모든 행을 찾는 방식으로 바꿨다.
    for (const name of selectedNames) {
      // 이름이 일치하는 모든 행의 "인덱스"를 모은다 (인덱스를 써야 같은 이름이어도
      // 서로 다른 라벨/드래그 위치로 구분할 수 있다)
      const matchingIndices = [];
      modulesList.forEach((m, idx) => {
        if (m.name === name) matchingIndices.push(idx);
      });

      for (const modIdx of matchingIndices) {
        const mod = modulesList[modIdx];

        // --- remap: 데이터의 좌표를 image 좌상단(0,0) 기준의 "사각형 좌상단 좌표"로 변환 ---
        // (사용자가 실측으로 검증한 공식)
        // x축: 그대로 오른쪽(+) 방향이 맞아서 부호 반전 없음
        // y축: 원본 데이터의 y는 이미지 좌표계와 방향이 반대라 부호를 반전(-)해야 하고,
        //      추가로 module의 height만큼을 더 빼야 정확한 "좌상단" y가 나온다.
        const remapX = mod.x + chipData.oneShotSize.width / 2 + chipData.outerScribeSize.width / 2;
        const remapY = -mod.y + chipData.oneShotSize.height / 2 + chipData.outerScribeSize.height / 2 - mod.height;

        // remapX, remapY는 "사각형의 좌상단 좌표"이므로, 중심을 따로 계산할 필요 없이
        // 여기서부터 바로 width/height만큼 사각형을 그리면 된다.
        const rectX = leftMargin + remapX * scaleX;
        const rectY = topMargin + remapY * scaleY;
        const rectW = mod.width * scaleX;
        const rectH = mod.height * scaleY;
        const centerPxX = rectX + rectW / 2;
        const centerPxY = rectY + rectH / 2;

        // --- module 사각형: 파란 배경(불투명), 흰색 굵은 글씨 라벨 ---
        ctx.fillStyle = '#2563eb';
        ctx.fillRect(rectX, rectY, rectW, rectH);
        ctx.strokeStyle = '#1d4ed8';
        ctx.lineWidth = 2;
        ctx.strokeRect(rectX, rectY, rectW, rectH);

        const label = name.replace(/^MAIN_/, '');
        // 겹침 경고 등에 표시할 "사람이 보는 이름"과, 코드 내부에서 서로 다른
        // 인스턴스를 구분하는 "고유 key"를 분리한다. 이름이 같은 module이
        // 여러 개 있어도 각각 다른 위치/드래그 상태를 가질 수 있게 하기 위함이다.
        const uniqueKey = `${label}#${modIdx}`;

        // [코드 위치 안내 3] 선택 module 내부 흰색 텍스트.
        // - font 크기: opts.moduleLabelFontSize (sawing 체인의 opts.fontSize와는 별개 값)
        // - 위치: opts.labelOffsets를 uniqueKey 기반 id로 재사용해서, 같은 이름의
        //   module이 여러 개여도 서로 독립적으로 드래그 이동이 가능하게 했다.
        //   사각형 자체는 고정, 텍스트만 옮겨진다.
        const modLabelId = `mod-${uniqueKey}`;
        const modOffset = opts.labelOffsets[modLabelId] || { dx: 0, dy: 0 };
        const modTextX = centerPxX + modOffset.dx;
        const modTextY = centerPxY + modOffset.dy;

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${opts.moduleLabelFontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, modTextX, modTextY);

        // 드래그 손잡이를 위해 위치 기록 (chainLabelPositions에 함께 담겨 동일한 방식으로 렌더링됨)
        labels.push({ id: modLabelId, x: modTextX, y: modTextY, text: label, color: '#ffffff' });

        // --- sawing line 4개: module 상하좌우로 Inner Scribe Line/2 만큼 띄운 위치 ---
        const cutLeft = rectX - halfInnerXpx;
        const cutRight = rectX + rectW + halfInnerXpx;
        const cutTop = rectY - halfInnerYpx;
        const cutBottom = rectY + rectH + halfInnerYpx;

        ctx.strokeStyle = '#dc2626'; // red
        ctx.lineWidth = SAWING_LINE_WIDTH;

        // 좌/우 sawing line (수직선, image보다 위아래로 더 길게)
        drawLine(ctx, cutLeft, imgTop - OVERSHOOT, cutLeft, imgBottom + OVERSHOOT);
        drawLine(ctx, cutRight, imgTop - OVERSHOOT, cutRight, imgBottom + OVERSHOOT);
        // 상/하 sawing line (수평선, image보다 좌우로 더 길게)
        drawLine(ctx, imgLeft - OVERSHOOT, cutTop, imgRight + OVERSHOOT, cutTop);
        drawLine(ctx, imgLeft - OVERSHOOT, cutBottom, imgRight + OVERSHOOT, cutBottom);

        // 겹침/이탈 검사용으로 기록. name은 uniqueKey로 저장해야 아래 chain 그리기에서
        // "같은 module의 좌/우 경계"를 판단할 때 다른 인스턴스와 혼동하지 않는다.
        cutBoxes.push({ name: uniqueKey, dispName: label, cutLeft, cutRight, cutTop, cutBottom });
        if (rectX < imgLeft || rectX + rectW > imgRight || rectY < imgTop || rectY + rectH > imgBottom) {
          outOfBoundsNames.push(label);
        }
      }
    }

    // 5) 겹침 검사: 선택된 module들의 sawing 영역(cut box)이 서로 겹치는지 확인
    const overlapPairs = [];
    for (let i = 0; i < cutBoxes.length; i++) {
      for (let j = i + 1; j < cutBoxes.length; j++) {
        const a = cutBoxes[i];
        const b = cutBoxes[j];
        const overlap = !(a.cutRight <= b.cutLeft || b.cutRight <= a.cutLeft || a.cutBottom <= b.cutTop || b.cutBottom <= a.cutTop);
        if (overlap) overlapPairs.push(`${a.dispName} ↔ ${b.dispName}`);
      }
    }

    const newWarnings = [];
    if (overlapPairs.length > 0) {
      newWarnings.push(`sawing line이 겹치는 module이 있습니다: ${overlapPairs.join(', ')} (잘못된 module 선택 또는 Inner/Outer Scribe 값을 확인하세요)`);
    }
    if (outOfBoundsNames.length > 0) {
      newWarnings.push(`다음 module의 위치가 image 영역을 벗어났습니다: ${outOfBoundsNames.join(', ')}`);
    }
    sawingWarnings = newWarnings;

    // 6) Sawing line & module 구간 체인
    //    image 시작 -> [검정: 간격] -> module의 sawing line 구간 [파랑] -> [검정: 간격] -> 다음 module [파랑] -> ... -> image 끝 [검정]
    //    width(가로, x축) 방향 체인은 아래쪽 여백에, height(세로, y축) 방향 체인은 오른쪽 여백에 배치한다.
    //
    // [버그 수정] 예전엔 "경계를 순서대로 정렬해서 인접한 left-right 태그를 짝짓는"
    // 방식이었는데, module 2개가 서로 맞닿아 있는 경우(예: 하나의 오른쪽 끝 =
    // 다른 하나의 왼쪽 끝) Inner Scribe Line을 더하면 경계 순서가 역전되면서
    // 페어링이 깨져 파란색이어야 할 구간이 검정으로 나오는 문제가 있었다.
    // 이제는 각 module의 [cutLeft, cutRight] 구간을 먼저 모아서 "구간 병합"으로
    // 처리한다 — 겹치거나 맞닿은 구간은 하나로 합쳐버리므로 순서가 절대 꼬이지 않는다.
    if (cutBoxes.length > 0) {
      const xSegments = buildChainSegments(
        cutBoxes.map((b) => [b.cutLeft, b.cutRight]),
        imgLeft,
        imgRight
      );
      const ySegments = buildChainSegments(
        cutBoxes.map((b) => [b.cutTop, b.cutBottom]),
        imgTop,
        imgBottom
      );

      const chainY = imgBottom + 25; // width 체인: image 바로 아래
      drawChainHorizontal(ctx, xSegments, chainY, scaleX, opts, labels, 'x');

      const chainX = imgRight + 25; // height 체인: image 바로 오른쪽
      drawChainVertical(ctx, ySegments, chainX, scaleY, opts, labels, 'y');
    }

    // 6-1) No Sawing Line (녹색 굵은 점선) - image 끝과 체인 화살표 사이 공간에 표시.
    //      sawing line(빨간 실선)과 달리 image 크기에 딱 맞춰서 그린다 (더 길게 뻗지 않음).
    ctx.setLineDash([10, 6]); // 점선 패턴
    ctx.strokeStyle = '#15803d'; // 진한 녹색
    ctx.lineWidth = 3;

    if (opts.noSawingH) {
      // 아래쪽(가로) 점선: image 너비에 맞춰서, image 아래 끝에서 opts만큼 떨어진 위치
      const y = imgBottom + opts.noSawingHOffset.base + opts.noSawingHOffset.drag;
      drawLine(ctx, imgLeft, y, imgRight, y);
      noSawingHLinePos = { x1: imgLeft, x2: imgRight, y };
    } else {
      noSawingHLinePos = null;
    }
    if (opts.noSawingV) {
      // 오른쪽(세로) 점선: image 높이에 맞춰서, image 오른쪽 끝에서 opts만큼 떨어진 위치
      const x = imgRight + opts.noSawingVOffset.base + opts.noSawingVOffset.drag;
      drawLine(ctx, x, imgTop, x, imgBottom);
      noSawingVLinePos = { y1: imgTop, y2: imgBottom, x };
    } else {
      noSawingVLinePos = null;
    }
    ctx.setLineDash([]); // 이후 그리는 선에 점선이 영향 주지 않도록 원상복구

    // 7) 상단 수평 치수선: Step Pitch width 총 길이 (검정, 굵게)
    const hArrowY = topMargin - 25;
    drawDoubleArrow(ctx, leftMargin, hArrowY, leftMargin + imgWidth, hArrowY, '#000000', STEP_PITCH_LINE_WIDTH);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(chipData.stepPitch.width, false), leftMargin + imgWidth / 2, hArrowY - 10);

    // 8) 좌측 수직 치수선: Step Pitch height 총 길이 (검정, 굵게, 세로쓰기)
    const vArrowX = leftMargin - 25;
    drawDoubleArrow(ctx, vArrowX, topMargin, vArrowX, topMargin + imgHeight, '#000000', STEP_PITCH_LINE_WIDTH);
    ctx.save();
    ctx.translate(vArrowX - 10, topMargin + imgHeight / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fmt(chipData.stepPitch.height, false), 0, 0);
    ctx.restore();

    // 편집 모드에서 드래그 손잡이를 그 위치에 겹쳐 그릴 수 있도록 저장해둔다.
    chainLabelPositions = labels;
  }

  // 단순 직선 하나를 긋는 헬퍼 (sawing line 등 화살표 없는 선용)
  function drawLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  /**
   * cutIntervals(각 module의 [시작, 끝] 픽셀 구간 목록)를 받아서,
   * "image 시작 -> 간격 -> module 구간 -> 간격 -> module 구간 -> ... -> image 끝"
   * 순서의 segment 배열로 만든다. { type: 'module' | 'gap', start, end } 형태.
   *
   * [수정] 예전엔 구간이 겹치거나 맞닿으면 하나로 "병합"했는데, module들이
   * 나란히 딱 붙어 배치된 정상적인 경우(각자의 sawing line 여백이 서로 상대방
   * 몸체 경계에 딱 맞닿는 경우)까지 하나로 합쳐져 버리는 문제가 있었다.
   * 이제는 병합하지 않고, 각 module을 항상 "자기 자신만의" 독립된 구간으로
   * 그린다. cursor는 "지금까지 그려진 가장 오른쪽(또는 아래쪽) 지점"만 추적해서,
   * 다음 module과의 사이에 실제로 남는 공간이 있을 때만 간격(gap)을 그린다.
   * (실제로 서로 몸체가 겹치는 심각한 오류 상황은 이미 별도의 겹침 경고로 안내한다.)
   */
  function buildChainSegments(cutIntervals, imgStart, imgEnd) {
    const sorted = cutIntervals.slice().sort((a, b) => a[0] - b[0]);

    const segments = [];
    let cursor = imgStart;
    for (const [s, e] of sorted) {
      if (s - cursor > 1) segments.push({ type: 'gap', start: cursor, end: s });
      segments.push({ type: 'module', start: s, end: e }); // 항상 이 module만의 구간으로 독립적으로 추가
      cursor = Math.max(cursor, e);
    }
    if (imgEnd - cursor > 1) segments.push({ type: 'gap', start: cursor, end: imgEnd });

    return segments;
  }

  /**
   * segment 배열(buildChainSegments의 결과)을 따라 화살표(<-->)와
   * 물리 단위 길이 텍스트를 그린다. type이 'module'이면 파란 화살표 + 빨간 숫자,
   * 'gap'이면 검정 화살표 + 검정 숫자.
   *
   * [코드 위치 안내 2-계속] opts.labelOffsets에 사용자가 드래그한 만큼의
   * 이동량이 들어있으면 텍스트 위치에 반영한다. 화살표 자체 위치는 실제
   * 측정값을 나타내므로 옮기지 않고, "숫자 텍스트"만 옮길 수 있게 했다.
   */
  function drawChainHorizontal(ctx, segments, y, scaleX, opts, labels, axisPrefix) {
    segments.forEach((seg, i) => {
      const isModuleSpan = seg.type === 'module';
      const color = isModuleSpan ? '#2563eb' : '#000000';

      drawDoubleArrow(ctx, seg.start, y, seg.end, y, color, CHAIN_LINE_WIDTH);

      const id = `${axisPrefix}-${i}`;
      const offset = opts.labelOffsets[id] || { dx: 0, dy: 0 };
      const textX = (seg.start + seg.end) / 2 + offset.dx;
      const textY = y + 8 + offset.dy;
      const lengthText = fmt((seg.end - seg.start) / scaleX, false);
      const textColor = isModuleSpan ? '#dc2626' : '#000000';

      ctx.fillStyle = textColor;
      ctx.font = `${opts.bold ? 'bold' : 'normal'} ${opts.fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(lengthText, textX, textY);

      // 편집 모드 드래그 손잡이를 위해 이 라벨의 위치를 기록
      labels.push({ id, x: textX, y: textY, text: lengthText, color: textColor });
    });
  }

  /** drawChainHorizontal의 세로 버전 (텍스트는 세로쓰기) */
  function drawChainVertical(ctx, segments, x, scaleY, opts, labels, axisPrefix) {
    segments.forEach((seg, i) => {
      const isModuleSpan = seg.type === 'module';
      const color = isModuleSpan ? '#2563eb' : '#000000';

      drawDoubleArrow(ctx, x, seg.start, x, seg.end, color, CHAIN_LINE_WIDTH);

      const id = `${axisPrefix}-${i}`;
      const offset = opts.labelOffsets[id] || { dx: 0, dy: 0 };
      const textX = x + 20 + offset.dx;
      const textY = (seg.start + seg.end) / 2 + offset.dy;
      const lengthText = fmt((seg.end - seg.start) / scaleY, false);
      const textColor = isModuleSpan ? '#dc2626' : '#000000';

      ctx.save();
      ctx.translate(textX, textY);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = textColor;
      ctx.font = `${opts.bold ? 'bold' : 'normal'} ${opts.fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(lengthText, 0, 0);
      ctx.restore();

      // 세로쓰기 텍스트라 히트박스 위치를 약간 보정해서 기록 (드래그 손잡이용)
      labels.push({ id, x: textX, y: textY, text: lengthText, color: textColor });
    });
  }

  /**
   * (x1,y1) - (x2,y2) 사이에 양끝 화살표(<---->) 를 그리는 헬퍼 함수.
   * color/lineWidth를 지정하면 그 색·굵기로, 지정 안 하면 검정/3px로 그린다.
   * [코드 위치 안내 1-계속] 이 함수의 lineWidth 매개변수 기본값이나,
   * 호출하는 쪽에서 넘기는 STEP_PITCH_LINE_WIDTH / CHAIN_LINE_WIDTH 값을
   * 바꾸면 화살표 굵기가 달라진다.
   */
  function drawDoubleArrow(ctx, x1, y1, x2, y2, color = '#000000', lineWidth = 3) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const headSize = lineWidth * 2.5; // 화살촉 크기를 선 굵기에 비례시켜, 굵은 선일수록 화살촉도 커지게 함
    drawArrowHead(ctx, x1, y1, x2, y2, headSize);
    drawArrowHead(ctx, x2, y2, x1, y1, headSize);
  }

  // tipX,tipY 위치에 화살촉을 그린다. otherX,otherY는 반대쪽 끝점(방향 계산용)
  function drawArrowHead(ctx, tipX, tipY, otherX, otherY, size) {
    const angle = Math.atan2(tipY - otherY, tipX - otherX);
    const spread = Math.PI / 7;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - size * Math.cos(angle - spread), tipY - size * Math.sin(angle - spread));
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - size * Math.cos(angle + spread), tipY - size * Math.sin(angle + spread));
    ctx.stroke();
  }

  // 숫자에 천단위 콤마를 넣어 보여주는 헬퍼 (React 버전의 toLocaleString과 동일)
  // 숫자를 표시용으로 포맷하는 헬퍼.
  // - 값이 정수면 그대로 정수로 (예: 3550 -> "3,550")
  // - 소수가 있으면 소수점 1자리까지만 반올림해서 표시 (예: 3228.34567 -> "3,228.3")
  // toLocaleString의 maximumFractionDigits는 "그 이상은 안 보여준다"는 뜻이라,
  // 정수는 자동으로 소수점 없이, 소수는 최대 1자리로 깔끔하게 나온다.
  // useGrouping: 천단위 콤마(,)를 넣을지 여부. 표에는 넣고(true), canvas에
  // 작게 그리는 숫자는 콤마 없이 깔끔하게 보이도록 false로 쓴다.
  function fmt(n, useGrouping = true) {
    if (n === null || n === undefined || n === '') return '-';
    const num = Number(n);
    if (Number.isNaN(num)) return String(n);
    return num.toLocaleString(undefined, { maximumFractionDigits: 1, useGrouping });
  }
</script>

<div class="page">
  <header>
    <div class="eyebrow">MAPGEN WEB — SVELTE / STEP 1 (수작업 입력 버전)</div>
    <h1>Input Data 붙여넣기 &amp; 이미지 불러오기</h1>
    <p class="desc">
      Excel 업로드 대신, 엑셀에서 드래그하여 복사한 셀 범위를 아래에 붙여넣으세요.
      MDM 해제 정책이 정리될 때까지 이 방식으로 화면 구성을 먼저 완성합니다.
    </p>
  </header>

  <section class="card">
    <div class="card-title">1) Excel 데이터 붙여넣기</div>
    <p class="hint">
      Excel에서 <b>Module명, width, height, x_position, y_position 컬럼과 One Shot Size /
      MostOuter ScribeLine Size / Step pitch 행</b>을 포함해서 드래그 → Ctrl+C 후,
      아래 칸을 클릭하고 Ctrl+V로 붙여넣으세요.
    </p>
    <textarea
      bind:value={pastedText}
      rows="10"
      placeholder="여기에 Excel에서 복사한 셀 범위를 붙여넣으세요 (Ctrl+V)"
    ></textarea>

    {#if warnings.length > 0}
      <div class="warning-box">
        {#each warnings as w}
          <div>⚠ {w}</div>
        {/each}
      </div>
    {/if}
  </section>

  <section class="card">
    <div class="card-title">2) 참조 이미지 &amp; 결과</div>
    <p class="hint">
      기본적으로 <code>static/sample/chip.png</code>가 표시됩니다. 다른 이미지로 바꿔보고 싶으면 아래에서 선택하세요.
      module을 선택하고 "파싱하기"를 누르면 이 이미지 위에 바로 덧그려집니다.
    </p>
    <input type="file" accept="image/*" onchange={handleImageChange} />
    <div class="image-name">{imageFileName}</div>

    <!-- [코드 위치 안내 2-계속] Image 편집 모드 & No Sawing Line 컨트롤 패널 -->
    <div class="edit-toolbar">
      <label class="toggle">
        <input type="checkbox" bind:checked={editMode} />
        Image 편집
      </label>

      {#if editMode}
        <span class="toolbar-sep"></span>
        <label class="toolbar-field">
          sawing 숫자 font
          <input type="range" min="8" max="28" bind:value={labelFontSize} />
          <span class="toolbar-value">{labelFontSize}px</span>
        </label>
        <label class="toggle">
          <input type="checkbox" bind:checked={labelBold} />
          bold
        </label>

        <span class="toolbar-sep"></span>
        <label class="toolbar-field">
          선택 module font
          <input type="range" min="10" max="36" bind:value={moduleLabelFontSize} />
          <span class="toolbar-value">{moduleLabelFontSize}px</span>
        </label>

        <span class="toolbar-sep"></span>
        <button type="button" class="reset-btn" onclick={resetLabelPositions}>위치 초기화</button>
      {/if}

      <span class="toolbar-sep"></span>
      <label class="toggle">
        <input type="checkbox" bind:checked={noSawingH} />
        No Sawing Line (가로)
      </label>
      <label class="toggle">
        <input type="checkbox" bind:checked={noSawingV} />
        No Sawing Line (세로)
      </label>
    </div>

    <div class="canvas-wrap">
      <!-- canvas-stage: canvas와 드래그 손잡이 overlay를 같은 좌표계로 겹치기 위한 래퍼 -->
      <div class="canvas-stage">
        <canvas bind:this={canvasEl}></canvas>

        {#if editMode}
          <!-- sawing/module 구간 길이 숫자 위의 투명 드래그 손잡이들 -->
          {#each chainLabelPositions as lbl (lbl.id)}
            <div
              class="drag-handle"
              style="left:{lbl.x * displayScale}px; top:{lbl.y * displayScale}px;"
              onpointerdown={(e) => startLabelDrag(e, lbl.id)}
              title="드래그해서 위치 이동"
            ></div>
          {/each}

          <!-- No Sawing Line 드래그 손잡이 -->
          {#if noSawingHLinePos}
            <div
              class="drag-handle line-handle-h"
              style="left:{((noSawingHLinePos.x1 + noSawingHLinePos.x2) / 2) * displayScale}px; top:{noSawingHLinePos.y * displayScale}px;"
              onpointerdown={startNoSawingHDrag}
              title="드래그해서 위아래로 이동"
            ></div>
          {/if}
          {#if noSawingVLinePos}
            <div
              class="drag-handle line-handle-v"
              style="left:{noSawingVLinePos.x * displayScale}px; top:{((noSawingVLinePos.y1 + noSawingVLinePos.y2) / 2) * displayScale}px;"
              onpointerdown={startNoSawingVDrag}
              title="드래그해서 좌우로 이동"
            ></div>
          {/if}
        {/if}
      </div>
    </div>
    {#if sawingWarnings.length > 0}
      <div class="warning-box" style="margin-top: 12px;">
        {#each sawingWarnings as w}
          <div>⚠ {w}</div>
        {/each}
      </div>
    {/if}
  </section>

  {#if chip}
    <section class="grid-3">
      <div class="info-card">
        <div class="info-sub">이미지 전체 크기</div>
        <div class="info-label">One Shot Size</div>
        <div class="info-value">
          {#if chip.oneShotSize}{fmt(chip.oneShotSize.width)} × {fmt(chip.oneShotSize.height)}{:else}미확인{/if}
        </div>
      </div>
      <div class="info-card">
        <div class="info-sub">칩 바깥 여백</div>
        <div class="info-label">Outer Scribe</div>
        <div class="info-value">
          {#if chip.outerScribeSize}{fmt(chip.outerScribeSize.width)} × {fmt(chip.outerScribeSize.height)}{:else}미확인{/if}
        </div>
      </div>
      <div class="info-card">
        <div class="info-sub">Shot + Scribe</div>
        <div class="info-label">Step pitch</div>
        <div class="info-value">
          {#if chip.stepPitch}{fmt(chip.stepPitch.width)} × {fmt(chip.stepPitch.height)}{:else}미확인{/if}
        </div>
      </div>
    </section>
  {/if}

  {#if modules.length > 0}
    <section class="card">
      <div class="card-title">3) Inner Scribe Line (module 간 간격)</div>
      <p class="hint">이 값이 있어야 좌표 변환 시 module 간 간격이 정확히 반영됩니다. margin 값은 입력하지 않으면 자동으로 0이 적용됩니다.</p>
      <div class="row-inputs">
        <input type="number" placeholder="inner_width" bind:value={innerScribeX} />
        <input type="number" placeholder="inner_height" bind:value={innerScribeY} />
        <input type="number" placeholder="inner_margin_width" bind:value={innerMarginWidth} />
        <input type="number" placeholder="inner_margin_height" bind:value={innerMarginHeight} />
      </div>

      <div class="module-select-row">
        <label class="hint" for="module-select-input">확인할 module (콤마로 구분, 예: M01, M02, M03)</label>
        <input
          id="module-select-input"
          type="text"
          class="module-select-input"
          placeholder="M01, M02, M03"
          bind:value={moduleSelectionInput}
        />
      </div>
      <button class="primary" onclick={handleModuleSelect}>파싱하기</button>

      {#if selectionWarnings.length > 0}
        <div class="warning-box">
          {#each selectionWarnings as w}
            <div>⚠ {w}</div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="card">
      <div class="card-title">module {modules.length}개 인식됨</div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th class="left">Module명</th>
              <th>width</th>
              <th>height</th>
              <th>x_position</th>
              <th>y_position</th>
            </tr>
          </thead>
          <tbody>
            {#each modules as m}
              <tr class:selected={selectedModuleNames.includes(m.name)}>
                <td class="left">{m.name}</td>
                <td>{fmt(m.width)}</td>
                <td>{fmt(m.height)}</td>
                <td>{fmt(m.x)}</td>
                <td>{fmt(m.y)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<!--
  Svelte의 <style> 블록은 기본적으로 "이 컴포넌트 안에서만" 적용된다 (scoped CSS).
  React처럼 Tailwind나 CSS 모듈 같은 별도 라이브러리 없이도
  이름 충돌 걱정 없는 스타일링이 기본 내장되어 있는 것이 Svelte의 특징 중 하나다.
-->
<style>
  .page {
    max-width: 860px;
    margin: 0 auto;
    padding: 40px 24px;
    font-family: system-ui, sans-serif;
    color: var(--text-primary);
  }
  header {
    border-bottom: 1px solid var(--border);
    padding-bottom: 24px;
    margin-bottom: 24px;
  }
  .eyebrow {
    font-family: monospace;
    font-size: 12px;
    letter-spacing: 0.1em;
    color: var(--accent);
    margin-bottom: 8px;
  }
  h1 {
    font-size: 24px;
    margin: 0 0 8px;
  }
  .desc {
    color: var(--text-secondary);
    font-size: 14px;
    margin: 0;
  }
  .card {
    background: var(--bg-panel-soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 18px 20px;
    margin-bottom: 20px;
  }
  .card-title {
    font-weight: 600;
    margin-bottom: 6px;
    color: var(--text-strong);
  }
  .hint {
    color: var(--text-secondary);
    font-size: 13px;
    margin: 0 0 12px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-page);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: monospace;
    font-size: 13px;
    padding: 10px;
    margin-bottom: 12px;
  }
  button.primary {
    background: var(--accent-strong);
    color: var(--accent-contrast);
    border: none;
    border-radius: 6px;
    padding: 8px 18px;
    font-weight: 600;
    cursor: pointer;
  }
  button.primary:hover {
    background: var(--accent);
  }
  .warning-box {
    margin-top: 12px;
    background: var(--warning-bg);
    border: 1px solid var(--warning-border);
    color: var(--warning-text);
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 13px;
  }
  .image-preview {
    margin-top: 14px;
  }
  .image-preview img {
    max-width: 100%;
    border-radius: 6px;
    border: 1px solid var(--border);
  }
  .image-name {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 6px;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 20px;
  }
  .info-card {
    background: var(--bg-panel-soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
  }
  .info-sub {
    font-size: 11px;
    color: var(--text-muted);
  }
  .info-label {
    font-size: 14px;
    color: var(--accent);
    font-weight: 500;
    margin-bottom: 8px;
  }
  .info-value {
    font-family: monospace;
    font-size: 14px;
  }
  .row-inputs {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .row-inputs input {
    width: 150px;
    background: var(--bg-page);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text-primary);
    padding: 6px 10px;
    font-family: monospace;
  }
  .module-select-row {
    margin-top: 16px;
  }
  .module-select-row label {
    display: block;
    margin-bottom: 6px;
  }
  .module-select-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--bg-page);
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    color: var(--text-primary);
    font-family: monospace;
    font-size: 13px;
    padding: 8px 10px;
    margin-bottom: 12px;
  }
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-family: monospace;
    font-size: 13px;
  }
  thead {
    background: var(--bg-panel);
    color: var(--text-secondary);
    text-transform: uppercase;
    font-size: 11px;
  }
  th, td {
    padding: 8px 14px;
    text-align: right;
  }
  th.left, td.left {
    text-align: left;
  }
  tbody tr:nth-child(even) {
    background: var(--bg-panel-soft-2);
  }
  tbody tr.selected {
    background: var(--accent-soft-25) !important;
    outline: 1px solid var(--accent);
  }
  tbody tr.selected td.left {
    color: var(--accent-light);
    font-weight: 600;
  }
  .canvas-wrap {
    overflow-x: auto;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 12px;
  }
  .canvas-stage {
    position: relative;
    display: inline-block;
  }
  .canvas-wrap canvas {
    display: block;
    max-width: 100%;
    height: auto;
    border-radius: 4px;
  }

  /* [코드 위치 안내 2-계속] Image 편집 도구 모음 스타일 */
  .edit-toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 14px;
    background: var(--bg-page-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    margin: 12px 0;
    font-size: 13px;
  }
  .toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    white-space: nowrap;
  }
  .toolbar-field {
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
  }
  .toolbar-value {
    font-family: monospace;
    color: var(--accent);
    min-width: 34px;
  }
  .toolbar-sep {
    width: 1px;
    align-self: stretch;
    background: var(--border);
  }
  .reset-btn {
    background: transparent;
    border: 1px solid var(--danger);
    color: var(--danger-light);
    border-radius: 6px;
    padding: 5px 12px;
    font-size: 12px;
    cursor: pointer;
  }
  .reset-btn:hover {
    background: var(--danger-soft-15);
  }

  /* 드래그 손잡이: 평소엔 흐릿한 원으로 보이다가, 마우스를 올리면 눈에 띄게 커진다.
     실제 화면(canvas)의 정확한 위치 위에 겹쳐지도록 position:absolute + translate(-50%,-50%) 사용 */
  .drag-handle {
    position: absolute;
    width: 18px;
    height: 18px;
    margin-left: -9px;
    margin-top: -9px;
    border-radius: 50%;
    background: var(--accent-border-35);
    border: 1px solid var(--accent);
    cursor: grab;
    touch-action: none; /* 터치 드래그가 스크롤로 오인되지 않도록 */
  }
  .drag-handle:hover {
    background: var(--accent-border-60);
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  .line-handle-h {
    cursor: ns-resize;
    width: 26px;
    height: 12px;
    margin-left: -13px;
    margin-top: -6px;
    border-radius: 6px;
  }
  .line-handle-v {
    cursor: ew-resize;
    width: 12px;
    height: 26px;
    margin-left: -6px;
    margin-top: -13px;
    border-radius: 6px;
  }
</style>
